# Scroll-aware hit testing

Implement an additive, scroll-aware hit-testing API in Trend without changing `useLayout()` semantics.

## Problem

Trend currently has two coordinate spaces:

1. **Logical layout coordinates**
   - Produced by the layout pass.
   - Exposed through `useLayout()`.
   - Describe a component's allocated position and dimensions in content space.

2. **Painted terminal coordinates**
   - Produced during painting.
   - Include ancestor paint offsets such as `ScrollBox` scroll offsets.
   - Are clipped by scroll viewports and other ancestor clips.
   - Match the coordinates reported by mouse events.

`ScrollBox` applies scrolling only during painting:

```js
childOffset = {
  x: offset?.x ?? 0,
  y: (offset?.y ?? 0) - scrollY,
}
```

That offset is passed through `paintTree()`, but it is not reflected in the rectangles returned by `useLayout()`.

As a result, this common pattern is incorrect for descendants of a scrolled container:

```js
const layout = useLayout()

useMouse((event) => {
  const inside =
    event.x >= layout.x &&
    event.x < layout.x + layout.width &&
    event.y >= layout.y &&
    event.y < layout.y + layout.height
})
```

The mouse event uses terminal coordinates, while `layout` uses unscrolled content coordinates. It also does not account for partial or complete clipping by an ancestor viewport.

## Compatibility constraint

Do not redefine `useLayout()`.

Existing components may rely on:

- `layout.x` and `layout.y` as logical coordinates.
- `layout.width` and `layout.height` as allocated dimensions.
- `layout.contentHeight`.
- `layout.childHeights`.
- Stable geometry even when a component is partially or fully outside a viewport.

Changing those fields to painted or clipped geometry could silently break layout measurement, scrolling, controls, overlays, and downstream consumers.

The new behavior should be fully additive.

## Proposed public API

Add a hook such as:

```js
const hitTest = useHitTest()
```

It returns a stable function:

```js
hitTest(x, y) -> boolean
```

Usage:

```js
function Hoverable() {
  const hitTest = useHitTest()
  const [hovered, setHovered] = createSignal(false)

  useMouse((event) => {
    if (event.action !== 'move') return
    setHovered(hitTest(event.x, event.y))
  })

  return (
    <box>
      {hovered() ? 'hovered' : 'not hovered'}
    </box>
  )
}
```

`hitTest(x, y)` must test terminal coordinates against the component's final painted and clipped rectangle.

It should return `false` when:

- The point lies outside the component's painted bounds.
- The point lies inside the logical bounds but outside an ancestor clip.
- The component is completely clipped.
- The component is no longer mounted.
- Painted geometry has not yet been established.

The returned function should remain stable across renders and read the current geometry at call time. Callers should not need to reacquire it after scrolling, resizing, or layout changes.

## Internal representation

Each component instance should retain two distinct geometry concepts:

```js
instance.layout
```

Existing logical layout metadata. Do not change its meaning or fields.

```js
instance.paintedRect
```

New renderer-maintained terminal-space geometry used for hit testing.

A rectangle could use:

```js
{
  x,
  y,
  width,
  height,
}
```

A completely clipped or unavailable component can be represented as `null`, rather than a zero-sized rectangle. `null` makes the unavailable state explicit.

If useful internally, distinguish:

- Transformed painted bounds before clipping.
- Visible bounds after clipping.

The public hit test should use the visible, clipped bounds.

## Rectangle calculation

The renderer already has the necessary information in `paintTree()`:

- The node's logical layout.
- The accumulated ancestor paint offset.
- The active clip rectangle.

For a node with logical rectangle:

```js
const logical = node._layout
```

and accumulated offset:

```js
const offset = {
  x: ...,
  y: ...,
}
```

derive terminal-space painted bounds:

```js
const painted = {
  x: logical.x + (offset?.x ?? 0),
  y: logical.y + (offset?.y ?? 0),
  width: logical.width,
  height: logical.height,
}
```

Then intersect that rectangle with the active clip:

```js
const visible = intersectRect(painted, clip)
```

The exact implementation must follow Trend's existing coordinate and clipping conventions. In particular, inspect whether `_availableRect` or `_layout` is appropriate for component roots. Do not assume every instance maps directly to a primitive box without checking the renderer's instance-to-node relationship.

### Nested scrolling

The calculation must use the fully accumulated paint offset, not merely the nearest `ScrollBox` offset.

For nested scrolling:

```text
outer scroll offset
  + inner scroll offset
  + any other ancestor paint transforms
```

must all affect the final terminal rectangle.

The current `paintTree()` traversal appears to propagate accumulated offsets, so geometry should be captured from the effective offset at the point the component root is painted.

### Clipping

The visible rectangle must be intersected with every effective ancestor clip.

Because `paintTree()` already passes a progressively constrained clip into descendants, the current active clip should represent the intersection of ancestor clipping regions. Confirm this rather than recreating clipping independently.

Examples:

- Logical rectangle: `{ x: 10, y: 5, width: 20, height: 4 }`
- Active clip: `{ x: 0, y: 7, width: 80, height: 20 }`
- Visible rectangle: `{ x: 10, y: 7, width: 20, height: 2 }`

A point at `(12, 6)` must not hit, even though it lies inside the logical rectangle.

### Half-open bounds

Use the same half-open convention as existing Trend controls:

```js
x >= rect.x &&
x < rect.x + rect.width &&
y >= rect.y &&
y < rect.y + rect.height
```

This avoids overlap on adjacent right and bottom edges.

## Associating painted geometry with components

This is the main implementation detail requiring care.

`useLayout()` gets its data from the current component instance. `useHitTest()` should likewise capture the current hook owner and read geometry associated with that owner.

During painting, when visiting a node owned by a component instance:

```js
node._instance
```

or the renderer's equivalent relationship, update that instance's `paintedRect`.

Potential issue: a function component may resolve to fragments, nested components, or multiple primitive nodes. Determine Trend's existing ownership semantics before choosing behavior.

The intended initial semantic should probably match `useLayout()`:

- Hit testing applies to the component root geometry represented by the current instance.
- A component returning a single `<box>` uses that box's painted bounds.
- Wrapper components such as `Button` should receive the painted bounds of their resolved root node.

If an instance can legitimately own multiple root nodes, either:

1. Store multiple visible rectangles and hit if any contains the point, or
2. Store their visible union, but only if the union cannot create false-positive gaps.

Multiple rectangles are more correct. A bounding union may report hits in empty space between roots.

Do not broaden scope unnecessarily if Trend's component model guarantees a single root node.

## Render lifecycle and stale geometry

Painted geometry must not remain stale.

At the beginning of each paint/frame:

- Mark painted geometry unavailable for all mounted instances, or
- Associate geometry with a frame generation number.

During painting:

- Record current visible geometry for encountered instances.

After painting:

- Any instance not encountered or not visible must not retain a rectangle from an earlier frame.

A generation-based design avoids eagerly clearing every instance:

```js
instance.paintedRect = visible
instance.paintedFrame = currentFrame
```

Then:

```js
hitTest(x, y) {
  if (instance.paintedFrame !== currentPaintFrame) return false
  const rect = instance.paintedRect
  // ...
}
```

However, be careful about when `currentPaintFrame` increments and when input can arrive relative to paint completion. The simpler clear-before-paint approach may be preferable unless performance measurements show otherwise.

Unmount cleanup must also ensure a retained `hitTest` function returns `false` after its owner is gone.

## Reactivity and rendering order

Updating `instance.paintedRect` during painting must be plain mutable renderer metadata.

It must not:

- Update a signal.
- Schedule another frame.
- Mark the component dirty.
- Trigger layout.
- Cause a resolve-paint loop.
- Make output depend on whether the component was painted earlier in the same traversal.

`useHitTest()` should return a closure over an instance-owned mutable reference, similar in spirit to other hooks that expose renderer state.

Pseudo-code:

```js
export function useHitTest() {
  const state = registerHook(() => {
    const owner = getCurrentHookOwner()

    return {
      test(x, y) {
        if (!owner || !owner.mounted) return false
        const rect = owner.paintedRect
        if (!rect) return false

        return (
          x >= rect.x &&
          x < rect.x + rect.width &&
          y >= rect.y &&
          y < rect.y + rect.height
        )
      },
    }
  })

  return state.test
}
```

Adapt this to Trend's actual hook and ownership lifecycle. Do not use this pseudo-code verbatim without checking whether hook state survives owner cleanup and whether there is an explicit mounted flag.

## Interaction with overlays

Test and define behavior for overlays.

A component inside an overlay should receive its final terminal-space visible bounds. Overlay positioning, modal clipping, and fullscreen backdrops may use separate layout or paint paths, so ensure painted geometry is recorded there as well.

`useHitTest()` itself only answers geometric containment. It does not necessarily need to implement z-order or event capture semantics.

If Trend's input system dispatches mouse events to every listener and relies on `event.stopPropagation()`, then overlapping components may both geometrically hit. Existing input dispatch order and capture behavior should remain responsible for deciding which handler acts.

Do not turn this change into a complete scene-graph pointer dispatch redesign.

## Interaction with ScrollBox

Do not change ScrollBox's logical measurements:

- `contentHeight`
- `childHeights`
- `maxOffset`
- Existing keyboard and wheel behavior
- Follow/pinning behavior

The only new effect should be that components inside a scrolled viewport can accurately test terminal-space mouse positions.

Also verify ScrollBox's own `useLayout()` and mouse handling remain unchanged. It may continue using logical layout because its own root is generally not transformed by its own scroll offset. The new API should not require converting existing ScrollBox code unless desired separately.

## Suggested tests

### Hook behavior outside scrolling

Render a component at a known location and assert:

- Interior point returns `true`.
- Left/top boundary returns `true`.
- Right boundary returns `false`.
- Bottom boundary returns `false`.
- Exterior points return `false`.

### Scrolled descendant

Render a fixed-height `ScrollBox` with a child below the initial viewport, then scroll it into view.

Assert:

- Hit testing uses the child's painted screen position.
- Its original logical content position does not hit.
- Changing scroll offset updates hit testing.

### Partial clipping

Position a child so only its lower or upper rows are visible.

Assert:

- Visible rows hit.
- Clipped rows do not hit.
- Width and horizontal clipping are also handled if Trend supports horizontal clipping paths.

### Complete clipping

Render a child entirely outside a scroll viewport.

Assert all points return `false`, including points that would match its logical bounds.

### Nested scrolling

Place a scrollable container inside another scrollable container.

Apply nonzero offsets to both.

Assert the child's final hit area includes both transforms and all clipping intersections.

### Resize and relayout

Change terminal dimensions or component layout.

Assert the stable `hitTest` function uses the newest painted rectangle and does not retain the previous frame's geometry.

### Conditional rendering and unmount

Capture a hit-test function, remove the component, then invoke the retained function.

It must return `false`.

### Overlay

Render a component in a modal or overlay at a known position.

Assert its hit area matches its painted terminal position.

### No regressions

Run all existing tests, especially:

- Button mouse activation.
- Menu and list mouse selection.
- ScrollBox wheel behavior.
- Modal input capture.
- Selection.
- Renderer layout and clipping.
- SIGTERM mouse cleanup.
- Input parser tests.

## Documentation

Document `useHitTest()` alongside `useMouse()` and `useLayout()`.

Clarify:

- Arguments are zero-based terminal coordinates from mouse events.
- The result uses final painted bounds.
- Ancestor scroll offsets are applied.
- Ancestor clipping is respected.
- The function remains stable and reads current geometry.
- `useLayout()` continues to expose logical layout geometry.
- `useHitTest()` tests geometry only and does not imply focus or z-order ownership.

Example:

```js
function HoverableBox() {
  const hitTest = useHitTest()
  const [hovered, setHovered] = createSignal(false)

  useMouse((event) => {
    if (event.action !== 'move') return
    setHovered(hitTest(event.x, event.y))
  })

  return (
    <box style={{ bg: hovered() ? 'blue' : null }}>
      <text>hover me</text>
    </box>
  )
}
```

## Validation in Pico

After Trend tests pass:

1. In Pico, link the local Trend checkout:

   ```sh
   make deps-local
   ```

2. Build Pico.
3. Confirm the bundle/runtime resolves the local Trend implementation.
4. Update the user-message hover implementation to use:

   ```js
   const hitTest = useHitTest()
   ```

   instead of manually comparing against `useLayout()`.

5. Verify:
   - Hovering a visible user message reveals the rewind button.
   - Moving away hides it.
   - Hover works after transcript scrolling.
   - Partially clipped messages only hover over visible rows.
   - Clicking the button opens the existing rewind action panel for that exact message.
   - Busy-state behavior still matches `/rewind`.
   - Existing transcript scrolling and text selection remain functional.

Run Trend's full test suite and Pico's full test suite.

## Scope boundaries

Do not:

- Change `useLayout()` semantics.
- Rewrite mouse dispatch.
- Add DOM-style bubbling, enter, or leave events.
- Change ScrollBox layout behavior.
- Convert all existing controls to `useHitTest()` in the same change.
- Publish or commit Pico changes unless separately approved.

The desired result is a small, additive renderer capability: renderer-maintained visible geometry plus a stable `useHitTest()` hook that correctly bridges terminal mouse coordinates and painted component bounds.

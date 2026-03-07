FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev
COPY . .
RUN node esbuild.config.js
EXPOSE 2222
CMD ["node", "demo/server.js"]

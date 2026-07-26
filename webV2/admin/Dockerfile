# No build step — plain Express + EJS, server-rendered, no bundler. Talks to `api` server-to-
# server (never proxied through nginx like webV2's SPA — the browser only ever talks to this
# container, so there's no same-origin/CORS concern to solve).
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3000
CMD ["node", "src/server.js"]

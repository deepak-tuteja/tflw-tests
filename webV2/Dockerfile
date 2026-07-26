# Multi-stage: build the Vite/React/TS SPA, then serve the static output through nginx (which
# also reverse-proxies /v1/* to the api service — see nginx.conf for why same-origin matters).
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

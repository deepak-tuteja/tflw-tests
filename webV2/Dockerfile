# Multi-stage: build the Vite/React/TS SPA, then serve the static output through nginx (which
# also reverse-proxies /v1/* to the api service — see nginx.conf for why same-origin matters).
FROM node:22-alpine AS build
WORKDIR /app
# a11y flag corner (webV2-3): build-time toggle for the AccessibilityDemoPage's inaccessible half.
# Vite only inlines VITE_-prefixed env vars that exist at `vite build` time, so this has to be a
# Docker build ARG threaded into ENV before `npm run build`, not a runtime container env var.
ARG VITE_ENABLE_A11Y_VIOLATIONS=true
ENV VITE_ENABLE_A11Y_VIOLATIONS=$VITE_ENABLE_A11Y_VIOLATIONS
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

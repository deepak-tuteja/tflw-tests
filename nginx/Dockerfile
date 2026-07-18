# TLS sidecar (M22, enterprise arc cluster 1 — PLAN_ENTERPRISE.md decision 10): a self-signed
# HTTPS listener + a client-cert-requiring listener in front of the real api, both proxying to
# it unchanged. Certs are generated fresh at container start (docker-entrypoint.sh), never baked
# into the image or committed.
FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]

# `S-3d` infrastructure (tflw-tests `PLAN_M239_DOGFOOD_EXPANSION.md`, decision 18): the proxy tenant,
# so SPEC §3.5's proxy path is exercised by the sweep. tinyproxy is GPL-2.0 by its COPYING file; it
# is installed here from Alpine's own package at build time and runs as its own process — none of
# its code is in this repository. Pinned by the Alpine release.
FROM alpine:3.20
RUN apk add --no-cache tinyproxy
COPY tinyproxy.conf /etc/tinyproxy/tinyproxy.conf
COPY filter /etc/tinyproxy/filter
EXPOSE 8888
USER tinyproxy
CMD ["tinyproxy", "-d", "-c", "/etc/tinyproxy/tinyproxy.conf"]

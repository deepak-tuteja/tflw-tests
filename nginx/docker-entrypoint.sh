#!/bin/sh
# Generates a throwaway local CA + a SAN-bearing server cert + a client cert into the bind-mounted
# /certs volume (shared with the host, so a host-side `tflw run` can reference the client cert/key
# and CA directly), then starts nginx. Regenerated on every container start — nothing here is
# meant to be a stable fixture (M22, PLAN_ENTERPRISE.md decision 10).
#
# A CN-only cert is rejected outright by modern Node TLS (ERR_TLS_CERT_ALTNAME_INVALID) — testFlow
# hit this directly building its own mTLS unit tests (PLAN.md decision 99b) — so the server cert
# gets a real subjectAltName extension, not just a CN.
set -e

CERT_DIR=/certs
mkdir -p "$CERT_DIR"

# CA
openssl genrsa -out "$CERT_DIR/ca.key" 2048 >/dev/null 2>&1
openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" -sha256 -days 1 \
  -subj "/CN=testflow-tests-dev-CA" -out "$CERT_DIR/ca.pem" >/dev/null 2>&1

# Server cert — SAN covers both the in-network hostname (nginx) and how the host reaches it
# (localhost/127.0.0.1), since tflw.config's `insecure`/NODE_EXTRA_CA_CERTS tests run from the
# host, not from inside the compose network.
openssl genrsa -out "$CERT_DIR/server.key" 2048 >/dev/null 2>&1
openssl req -new -key "$CERT_DIR/server.key" -subj "/CN=nginx" \
  -addext "subjectAltName=DNS:nginx,DNS:localhost,IP:127.0.0.1" \
  -out "$CERT_DIR/server.csr" >/dev/null 2>&1
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.pem" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.pem" -days 1 -copy_extensions copy >/dev/null 2>&1

# Client cert — presented by tflw's `cert`/`key` config on the mTLS-requiring listener (8444).
openssl genrsa -out "$CERT_DIR/client.key" 2048 >/dev/null 2>&1
openssl req -new -key "$CERT_DIR/client.key" -subj "/CN=tflw-test-client" \
  -out "$CERT_DIR/client.csr" >/dev/null 2>&1
openssl x509 -req -in "$CERT_DIR/client.csr" -CA "$CERT_DIR/ca.pem" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/client.pem" -days 1 >/dev/null 2>&1

chmod 644 "$CERT_DIR"/*.pem "$CERT_DIR"/*.key

exec nginx -g "daemon off;"

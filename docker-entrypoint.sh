#!/bin/sh
# Migrate, then optionally create the first administrator, then hand over to the app.
set -e

# An unmounted or root-owned volume must fail loudly now, not as a crash page
# the first time somebody uploads a receipt.
if [ -n "$UPLOAD_DIR" ]; then
  echo "[boot] checking the upload volume at $UPLOAD_DIR"
  mkdir -p "$UPLOAD_DIR"
  probe="$UPLOAD_DIR/.write-probe-$$"
  if ! (echo ok > "$probe" && rm -f "$probe"); then
    echo "[boot] FATAL: $UPLOAD_DIR is not writable by $(id -un). Attach the Railway volume and check its permissions." >&2
    exit 1
  fi
fi

echo "[boot] applying database migrations"
node node_modules/prisma/build/index.js migrate deploy

echo "[boot] checking for an administrator account"
node scripts/bootstrap.mjs

echo "[boot] starting the application"
exec "$@"

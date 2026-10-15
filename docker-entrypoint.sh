#!/bin/sh
# Migrate, then optionally create the first administrator, then hand over to the app.
set -e

APP_USER=nextjs

# Railway mounts volumes owned by root, so take ownership while still root.
# An unmounted or unwritable volume must fail loudly now, not as a crash page
# the first time somebody uploads a receipt.
if [ -n "$UPLOAD_DIR" ]; then
  echo "[boot] preparing the upload volume at $UPLOAD_DIR"
  mkdir -p "$UPLOAD_DIR"
  if [ "$(id -u)" = "0" ]; then
    chown -R "$APP_USER" "$UPLOAD_DIR" 2>/dev/null || true
  fi
  probe="$UPLOAD_DIR/.write-probe-$$"
  if ! su-exec "$APP_USER" sh -c "echo ok > '$probe' && rm -f '$probe'"; then
    echo "[boot] FATAL: $UPLOAD_DIR is not writable by $APP_USER. Check the Railway volume mount." >&2
    exit 1
  fi
fi

echo "[boot] applying database migrations"
su-exec "$APP_USER" node node_modules/prisma/build/index.js migrate deploy

echo "[boot] checking for an administrator account"
su-exec "$APP_USER" node scripts/bootstrap.mjs

echo "[boot] starting the application as $APP_USER"
exec su-exec "$APP_USER" "$@"

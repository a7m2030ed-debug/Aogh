#!/bin/sh
# Makes the container self-sufficient: a fresh host with nothing but a
# DATABASE_URL comes up with its schema applied and its catalog loaded,
# rather than needing two manual commands run from somewhere else first.
set -e

echo "→ Applying database migrations..."
npx prisma migrate deploy

# Idempotent and cheap: prisma/seed.ts exits immediately when the catalog
# is already there, so this costs one count query on every boot after the
# first. Set SEED_ON_START=false to skip it entirely.
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "→ Seeding catalog (skips itself if already loaded)..."
  node dist-seed/seed.js
fi

echo "→ Starting API..."
exec node dist/main.js

#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  node_modules/.bin/typeorm migration:run -d dist/database/data-source.js
fi

exec "$@"

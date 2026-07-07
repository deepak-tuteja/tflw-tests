#!/bin/sh
set -e

echo "running migrations..."
npm run migration:run

echo "seeding..."
npm run seed

echo "starting api..."
exec node dist/main.js

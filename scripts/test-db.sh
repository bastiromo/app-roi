#!/usr/bin/env bash
# Aplica las migraciones en una base PostgreSQL desechable y corre las pruebas.
# Uso: DATABASE_URL_ADMIN=postgres://... scripts/test-db.sh   (por defecto: base local "app_roi_test")
set -euo pipefail
ADMIN_URL="${DATABASE_URL_ADMIN:-postgres:///postgres}"
DB="app_roi_test"
root="$(cd "$(dirname "$0")/.." && pwd)"

psql "$ADMIN_URL" -qX -c "drop database if exists $DB" -c "create database $DB"
TEST_URL="${ADMIN_URL%/*}/$DB"

psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$root/supabase/tests/auth_stub.sql"
for f in "$root"/supabase/migrations/*.sql; do
  psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$f"
done
psql "$TEST_URL" -qX -v ON_ERROR_STOP=1 -f "$root/supabase/tests/db_test.sql"
psql "$ADMIN_URL" -qX -c "drop database $DB"

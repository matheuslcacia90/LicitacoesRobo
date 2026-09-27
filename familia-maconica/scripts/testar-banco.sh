#!/usr/bin/env bash
# Aplica as migrações num banco descartável e roda os testes de regras.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/testar-banco.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-familia_maconica_teste}"

dropdb --if-exists "$DB"
createdb "$DB"
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

run -f supabase/tests/00_stub_supabase.sql
for f in supabase/migrations/*.sql; do
  echo "migração: $f"
  run -f "$f"
done
run -f supabase/tests/10_regras.sql >/dev/null
echo "OK — todos os testes de banco passaram."

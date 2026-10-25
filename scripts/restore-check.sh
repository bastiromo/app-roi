#!/usr/bin/env bash
# Prueba que un respaldo SÍ se puede restaurar: crea una base vacía con el mismo esquema
# (migraciones), carga los datos del respaldo y compara, tabla por tabla, el número de filas
# y una huella (md5) de su contenido contra la base de origen.
#
# Uso: SOURCE_URL=... TARGET_URL=... scripts/restore-check.sh respaldo.dump
#   SOURCE_URL: base de la que salió el respaldo (solo lectura).
#   TARGET_URL: base PostgreSQL VACÍA y desechable (se le aplican las migraciones).
#
# El respaldo trae solo el esquema public (los datos de la app). Usuarios, contraseñas y 2FA
# viven en Supabase Auth: en una recuperación real se recrean y se reasigna user_id.
set -euo pipefail
dump="$1"
export PGTZ=UTC   # misma zona horaria en ambas bases: las fechas se escriben igual
root="$(cd "$(dirname "$0")/.." && pwd)"
: "${SOURCE_URL:?falta SOURCE_URL}" "${TARGET_URL:?falta TARGET_URL}"

psql "$TARGET_URL" -qX -v ON_ERROR_STOP=1 -f "$root/supabase/tests/auth_stub.sql" >/dev/null
for f in "$root"/supabase/migrations/*.sql; do
  psql "$TARGET_URL" -qX -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
# --disable-triggers: sin auditoría duplicada ni llaves hacia auth.users durante la carga
pg_restore --data-only --disable-triggers --no-owner --exit-on-error -d "$TARGET_URL" "$dump"

tables=$(psql "$TARGET_URL" -AtX -c "select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by 1")
fingerprint() {
  local url="$1" t
  for t in $tables; do
    # Cada fila como JSON (sin depender del orden alfabético del servidor), ordenadas por su md5.
    # last_used_at (dispositivos recordados) cambia con cada visita a la app: no es parte del respaldo.
    psql "$url" -AtX -c "select '$t', count(*), md5(coalesce(string_agg(h, '|' order by h collate \"C\"), ''))
                         from (select md5((to_jsonb(x) - 'last_used_at')::text) h from public.\"$t\" x) s"
  done
}
fingerprint "$SOURCE_URL" > /tmp/origen.txt
fingerprint "$TARGET_URL" > /tmp/restaurado.txt

if diff -u /tmp/origen.txt /tmp/restaurado.txt; then
  echo "RESTAURACION_OK: $(wc -l < /tmp/origen.txt) tablas, $(awk -F'|' '{s += $2} END {print s}' /tmp/origen.txt) filas idénticas"
else
  # Una anotación por tabla distinta (visible en el resumen de la ejecución)
  join -t'|' /tmp/origen.txt /tmp/restaurado.txt | awk -F'|' '$3 != $5 {
    printf "::error::Tabla %s: origen %s filas, restaurado %s filas, contenido distinto\n", $1, $2, $4 }'
  echo "::error::El respaldo restaurado no coincide con la base de origen"
  exit 1
fi

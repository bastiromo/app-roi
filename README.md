# App ROI

Registro de costos, payouts e impuestos de cuentas de fondeo (prop firms), con ROI auditable en USD y CLP.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/domain/` | Motor de cálculo puro (sin UI ni base de datos). Aquí viven todas las fórmulas. |
| `tests/` | Pruebas del motor, incluidos los ejemplos del plan y datos reales de Lucid. |
| `supabase/migrations/` | Esquema de la base: tablas, seguridad por fila (RLS), auditoría, vista `cash_flows`. |
| `supabase/tests/` | Pruebas de la base (se corren en CI contra PostgreSQL 17). |
| `src/app/` | Interfaz (Next.js). `(auth)` = login y 2FA; `(app)` = pantallas con sesión. |
| `.github/workflows/` | CI, aplicar migraciones y respaldo nocturno cifrado. |

## Fórmulas (resumen)

- **C** costos = gastos pagados − reembolsos (sin impuestos ni comisiones ya descontadas en payouts)
- **R** recibido = dinero que llegó por payouts pagados (real o estimado, siempre identificado)
- **B** = R − C · **N** = B − impuestos · **ROI** = B / C · **ROI neto** = N / C
- Estimado de un payout: retiro × % del trader − comisión fija de transferencia (Lucid: 90 % − USD 25)

## Comandos

```bash
npm test          # motor de cálculo
npm run db:test   # migraciones + pruebas de base (requiere PostgreSQL local)
npm run build
```

## Secretos de GitHub (Settings → Secrets and variables → Actions)

- `SUPABASE_DB_URL`: cadena **Session pooler** de Supabase (Connect → Session pooler), con tu contraseña.
- `BACKUP_PASSPHRASE`: frase larga para cifrar los respaldos. Guárdala en tu gestor de contraseñas: sin ella no se pueden abrir.

## Restaurar un respaldo

```bash
gpg -d app-roi-AAAAMMDD-HHMM.dump.gpg > app-roi.dump
pg_restore --no-owner --clean --if-exists -d "$SUPABASE_DB_URL" app-roi.dump
```

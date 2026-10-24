/**
 * Columnas de las consultas a la API de Supabase (PostgREST).
 * Centralizadas aquí para que las pruebas de API (tests/api.test.ts) ejecuten exactamente
 * las mismas consultas que la app. Los montos se piden ::text para no perder precisión.
 */
export const Q = {
  firms:
    "id,name,website,default_trader_share_pct::text,split_tier_threshold::text,split_tier_pct_before::text," +
    "default_transfer_fee::text,transfer_fee_is_estimate,is_configured,is_active,payout_rules_notes,notes",
  firmsForPayout:
    "id,name,default_trader_share_pct::text,split_tier_threshold::text,split_tier_pct_before::text,default_transfer_fee::text,transfer_fee_is_estimate",
  accounts:
    "id,firm_id,label,external_id,plan_name,nominal_size::text,phase,status,origin_account_id,opened_on,closed_on,notes,firms(name)",
  expenses:
    "id,kind,refund_of_id,status,occurred_on,firm_id,account_id,category,description,amount::text,currency,usd_rate::text," +
    "fx_usd_clp::text,fx_source,external_ref,tx_hash,firms(name),accounts(label)",
  refundableCosts: "id,firm_id,occurred_on,amount::text,currency,description,category",
  payouts:
    "id,firm_id,account_id,status,requested_on,paid_on,requested_amount::text,trader_share_pct::text,firm_fee_amount::text,currency,notes,firms(name),accounts(label)",
  paidPayouts: "id,firm_id,requested_on,requested_amount::text",
  payoutReceipt:
    "receipts(received_on,basis,amount::text,currency,usd_rate::text,fx_usd_clp::text,fx_source,processor_fee::text,tx_hash,deleted_at)",
  flowsSummary: "flow_date,flow_type,direction,firm_id,is_estimated,amount_usd::text,amount_clp::text",
  flowsByPayout: "payout_id,amount_usd::text,amount_clp::text,is_estimated",
  statusHistory: "phase,status,changed_at",
} as const;

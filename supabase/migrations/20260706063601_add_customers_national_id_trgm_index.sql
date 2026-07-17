CREATE INDEX IF NOT EXISTS idx_customers_national_id_trgm
  ON public.customers USING gin (national_id gin_trgm_ops);

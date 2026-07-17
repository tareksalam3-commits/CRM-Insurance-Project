DO $$ BEGIN
    CREATE TYPE marital_status AS ENUM ('single', 'married', 'divorced', 'widowed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    national_id text UNIQUE,
    phone text,
    address text,
    birth_date date,
    occupation text,
    marital_status marital_status,
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_owner_id ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_national_id ON customers(national_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_select_hierarchy" ON customers;
CREATE POLICY "customers_select_hierarchy" ON customers FOR SELECT
    TO authenticated
    USING (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

DROP POLICY IF EXISTS "customers_insert_owner" ON customers;
CREATE POLICY "customers_insert_owner" ON customers FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "customers_update_owner" ON customers;
CREATE POLICY "customers_update_owner" ON customers FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "customers_delete_owner" ON customers;
CREATE POLICY "customers_delete_owner" ON customers FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
;

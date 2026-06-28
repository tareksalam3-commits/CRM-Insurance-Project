/*
# Create Customers Table

1. New Tables
   - `customers` - Customer information
   - `id` (uuid, primary key)
   - `name` (text, not null) - Customer name
   - `national_id` (text, unique) - National ID number
   - `phone` (text) - Phone number
   - `address` (text) - Address
   - `birth_date` (date) - Birth date
   - `occupation` (text) - Occupation
   - `marital_status` (enum: single, married, divorced, widowed)
   - `owner_id` (uuid, references users) - Direct responsible agent
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

2. Important Notes
   - National ID must be unique
   - Customer is linked to the hierarchy through owner_id
   - All users above owner_id in hierarchy can see the customer
   - When user is disabled, customers remain unchanged
   - When user is transferred, customers transfer with them

3. Security
   - Enable RLS on `customers`
   - Users can see customers owned by themselves or users below them
   - Only the owner can insert/update their own customers
*/

-- Create enum for marital status
DO $$ BEGIN
    CREATE TYPE marital_status AS ENUM ('single', 'married', 'divorced', 'widowed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create customers table
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_owner_id ON customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_customers_national_id ON customers(national_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING gin(to_tsvector('arabic', name));

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
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

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

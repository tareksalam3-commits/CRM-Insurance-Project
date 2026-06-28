/*
# Create Policies (Documents) Table

1. New Tables
   - `policies` - Insurance policy documents
   - `id` (uuid, primary key)
   - `policy_number` (text, unique, not null) - Policy number
   - `customer_id` (uuid, references customers) - Customer owner
   - `owner_id` (uuid, references users) - Agent responsible
   - `policy_type` (enum: quadruple, protection_investment, mixed, installments, pension_peace)
   - `start_date` (date) - Start date of coverage
   - `payment_method` (enum: monthly, quarterly, semi_annual, annual)
   - `premium_amount` (decimal) - Installment value
   - `status` (enum: active, suspended, cancelled)
   - `notes` (text)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

2. Policy Types
   - quadruple (الرباعية)
   - protection_investment (حماية واستثمار)
   - mixed (مختلط)
   - installments (ذو أقساط)
   - pension_peace (معاش واطمئنان)

3. Payment Methods
   - monthly (12 installments)
   - quarterly (4 installments)
   - semi_annual (2 installments)
   - annual (1 installment)

4. Automatic Suspension
   - System automatically suspends a policy if any installment is 2 months overdue
   - Notification sent to owner and direct manager

5. Security
   - Enable RLS on `policies`
   - Users can see policies owned by themselves or users below them
   - Only the owner can insert/update their own policies
*/

-- Create enum for policy type
DO $$ BEGIN
    CREATE TYPE policy_type AS ENUM (
        'quadruple',
        'protection_investment',
        'mixed',
        'installments',
        'pension_peace'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for payment method
DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM (
        'monthly',
        'quarterly',
        'semi_annual',
        'annual'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for policy status
DO $$ BEGIN
    CREATE TYPE policy_status AS ENUM (
        'active',
        'suspended',
        'cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create policies table
CREATE TABLE IF NOT EXISTS policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_number text UNIQUE NOT NULL,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    policy_type policy_type NOT NULL,
    start_date date NOT NULL,
    payment_method payment_method NOT NULL,
    premium_amount decimal(12,2) NOT NULL,
    status policy_status NOT NULL DEFAULT 'active',
    notes text,
    suspended_at timestamptz,
    suspended_reason text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_policies_customer_id ON policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_policies_owner_id ON policies(owner_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_start_date ON policies(start_date);
CREATE INDEX IF NOT EXISTS idx_policies_policy_number ON policies(policy_number);

-- Enable RLS
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "policies_select_hierarchy" ON policies;
CREATE POLICY "policies_select_hierarchy" ON policies FOR SELECT
    TO authenticated
    USING (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

DROP POLICY IF EXISTS "policies_insert_owner" ON policies;
CREATE POLICY "policies_insert_owner" ON policies FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "policies_update_owner" ON policies;
CREATE POLICY "policies_update_owner" ON policies FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "policies_delete_owner" ON policies;
CREATE POLICY "policies_delete_owner" ON policies FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
CREATE TRIGGER update_policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Sreshta Nutri Mithai - Supabase Database Schema (Complete Version)
-- Copy and paste this ENTIRE block into the Supabase SQL Editor and click 'Run'.

-- 1. Clean slate: Drop the table if it already exists
DROP TABLE IF EXISTS orders;

-- 2. Create the Orders Table with standard Supabase defaults
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    customer_address TEXT NOT NULL,
    customer_pincode VARCHAR(10) NOT NULL,
    items JSONB NOT NULL,
    subtotal NUMERIC NOT NULL,
    shipping_fee NUMERIC NOT NULL,
    grand_total NUMERIC NOT NULL,
    order_status VARCHAR(20) DEFAULT 'received',
    tracking_id VARCHAR(50) DEFAULT NULL,
    courier_name VARCHAR(100) DEFAULT NULL,
    tracking_link TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 3. Create Indexes for fast querying
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- 4. Disable Row Level Security (RLS) to allow public checkouts and admin fetches
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

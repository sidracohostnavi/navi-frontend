-- Migration: Add Direct Booking Support
-- Created: 2026-03-17 06:26:00
-- Description: Adds schema changes to support direct bookings, listing details, and Stripe integration.

-------------------------------------------------------------------------------
-- 1. Update cohost_properties with listing details
-------------------------------------------------------------------------------
ALTER TABLE public.cohost_properties 
  ADD COLUMN IF NOT EXISTS direct_booking_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS listing_photos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rental_agreement_text TEXT,
  ADD COLUMN IF NOT EXISTS nightly_rate INTEGER,
  ADD COLUMN IF NOT EXISTS cleaning_fee INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_nights INTEGER DEFAULT 1;

-- Pricing constraints
ALTER TABLE public.cohost_properties ADD CONSTRAINT properties_nightly_rate_check 
  CHECK (nightly_rate IS NULL OR nightly_rate >= 0);

ALTER TABLE public.cohost_properties ADD CONSTRAINT properties_cleaning_fee_check 
  CHECK (cleaning_fee IS NULL OR cleaning_fee >= 0);

ALTER TABLE public.cohost_properties ADD CONSTRAINT properties_min_nights_check 
  CHECK (min_nights IS NULL OR min_nights >= 1);

-------------------------------------------------------------------------------
-- 2. Update cohost_workspaces with Stripe Connect details
-------------------------------------------------------------------------------
ALTER TABLE public.cohost_workspaces
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN DEFAULT false;

-------------------------------------------------------------------------------
-- 3. Update bookings with direct booking fields
-------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ical',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS total_price INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS rental_agreement_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Source and Status constraints
-- Drop existing constraints if they exist to avoid duplication errors
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_source_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_source_check 
  CHECK (source IN ('ical', 'direct'));

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
  CHECK (status IN ('confirmed', 'pending_payment', 'cancelled'));

-------------------------------------------------------------------------------
-- 4. Create booking_holds table for guest checkout flow
-------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.cohost_properties(id) ON DELETE CASCADE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Tracking for expiration/conversion
  released_at TIMESTAMPTZ,
  converted_booking_id UUID REFERENCES public.bookings(id),
  
  -- Prevent duplicate holds for same dates by same session
  CONSTRAINT unique_hold_dates UNIQUE (property_id, check_in, check_out, session_id)
);

-- Index for availability queries
CREATE INDEX IF NOT EXISTS idx_booking_holds_property_dates ON public.booking_holds(property_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_booking_holds_expires ON public.booking_holds(expires_at);

-- Set up RLS for booking_holds
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

-- Holds can be created by anyone (guest checkout creates them)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can create holds') THEN
        CREATE POLICY "Anyone can create holds" ON public.booking_holds
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- Holds can be read by workspace members
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Workspace members can view holds') THEN
        CREATE POLICY "Workspace members can view holds" ON public.booking_holds
            FOR SELECT USING (
                property_id IN (
                    SELECT id FROM public.cohost_properties WHERE workspace_id IN (
                        SELECT workspace_id FROM public.cohost_workspace_members 
                        WHERE user_id = auth.uid()
                    )
                )
            );
    END IF;
END $$;

-- Holds can be deleted by system (service role) or expire naturally
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role can delete holds') THEN
        CREATE POLICY "Service role can delete holds" ON public.booking_holds
            FOR DELETE USING (true);
    END IF;
END $$;

-------------------------------------------------------------------------------
-- 5. Backfill existing data
-------------------------------------------------------------------------------
-- All existing bookings are from iCal and confirmed
UPDATE public.bookings 
SET source = 'ical', status = 'confirmed' 
WHERE source IS NULL;

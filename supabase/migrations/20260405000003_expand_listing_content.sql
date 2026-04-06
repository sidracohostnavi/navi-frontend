-- Migration: Expand Listing Content Sections
-- Created: 2026-04-05
-- Description: Adds detailed description sections to cohost_properties.

ALTER TABLE public.cohost_properties 
  ADD COLUMN IF NOT EXISTS your_property TEXT,
  ADD COLUMN IF NOT EXISTS guest_access TEXT,
  ADD COLUMN IF NOT EXISTS interaction_with_guests TEXT,
  ADD COLUMN IF NOT EXISTS other_details TEXT;

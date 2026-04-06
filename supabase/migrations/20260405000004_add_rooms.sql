-- Migration: Add Rooms Support
-- Created: 2026-04-05
-- Description: Adds rooms JSONB column to cohost_properties.

ALTER TABLE public.cohost_properties 
  ADD COLUMN IF NOT EXISTS rooms JSONB DEFAULT '[]'::jsonb;

-- Migration: Add color column to ical_feeds
--
-- Each iCal feed (Airbnb, VRBO, Booking.com, etc.) gets a user-customizable
-- color. This color is used to color booking windows on the calendar from the
-- moment a booking arrives via iCal sync — no email enrichment required.
--
-- This replaces the old model where booking colors came from connections
-- (which only colored enriched bookings, leaving most bookings gray).

ALTER TABLE ical_feeds
  ADD COLUMN IF NOT EXISTS color TEXT;
  -- Hex color string e.g. '#FF5A5F'. NULL = no color set (falls back to gray).

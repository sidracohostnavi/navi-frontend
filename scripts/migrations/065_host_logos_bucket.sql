-- Migration: Create Storage Bucket for Host Logos
-- Description: Creates a public storage bucket 'host-logos' for host profile logos/photos.

BEGIN;

-- 1. Create Bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('host-logos', 'host-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop old policies to prevent conflicts if re-running
DROP POLICY IF EXISTS "Host logos public access" ON storage.objects;
DROP POLICY IF EXISTS "Host logos auth upload" ON storage.objects;
DROP POLICY IF EXISTS "Host logos owner update" ON storage.objects;
DROP POLICY IF EXISTS "Host logos owner delete" ON storage.objects;

-- 3. Create Policies

-- Allow anyone to VIEW logos
CREATE POLICY "Host logos public access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'host-logos' );

-- Allow authenticated users to UPLOAD logos
CREATE POLICY "Host logos auth upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'host-logos' AND
  auth.role() = 'authenticated'
);

-- Allow users to UPDATE their own logos
CREATE POLICY "Host logos owner update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'host-logos' AND
  auth.uid() = owner
);

-- Allow users to DELETE their own logos
CREATE POLICY "Host logos owner delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'host-logos' AND
  auth.uid() = owner
);

COMMIT;

-- Migration: Create Storage Bucket for Property Images
-- Description: Creates a storage bucket 'property-images' and sets up RLS policies.

BEGIN;

-- 1. Create Bucket (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('property-images', 'property-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop old policies to prevent conflicts if re-running
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload" ON storage.objects;
DROP POLICY IF EXISTS "Owner Update" ON storage.objects;
DROP POLICY IF EXISTS "Owner Delete" ON storage.objects;

-- 3. Create Policies

-- Allow anyone to VIEW images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'property-images' );

-- Allow authenticated users to UPLOAD images
CREATE POLICY "Auth Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' AND 
  auth.role() = 'authenticated'
);

-- Allow users to UPDATE their own images
CREATE POLICY "Owner Update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images' AND 
  auth.uid() = owner
);

-- Allow users to DELETE their own images
CREATE POLICY "Owner Delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' AND 
  auth.uid() = owner
);

COMMIT;

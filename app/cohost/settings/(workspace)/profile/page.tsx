'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';
import { Camera, Upload } from 'lucide-react';

export default function ProfileSettingsPage() {
  const supabase = createClient();

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    business_name: '',
    phone: '',
  });
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/cohost/profile');
      if (res.ok) {
        const data = await res.json();
        setEmail(data.email || '');
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          business_name: data.business_name || '',
          phone: data.phone || '',
        });
        setLogoUrl(data.logo_url || null);
      } else {
        const d = await res.json();
        setError(d.error || 'Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('host-logos')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('host-logos')
        .getPublicUrl(path);

      setLogoUrl(publicUrl);
    } catch (e: any) {
      setError(e.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/cohost/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, logo_url: logoUrl }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save profile');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-4">
        <div className="h-6 w-48 bg-gray-200 rounded" />
        <div className="h-20 w-20 bg-gray-200 rounded-full" />
        <div className="h-10 w-full bg-gray-100 rounded-lg" />
      </div>
    );
  }

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#008080]/30 focus:border-[#008080] transition-colors';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Profile</h1>
      <p className="text-sm text-gray-500 mb-8">
        Your host identity and business information. Business name is used as your workspace name.
      </p>

      {/* ── Logo / Photo ── */}
      <div className="mb-8">
        <label className={labelCls}>Business Logo / Host Photo</label>
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 relative shrink-0">
            {logoUrl ? (
              <Image src={logoUrl} alt="Logo" fill className="object-cover" />
            ) : (
              <Camera className="w-7 h-7 text-gray-300" />
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading...' : logoUrl ? 'Change Image' : 'Upload Image'}
            </button>
            <p className="text-xs text-gray-400 mt-1.5">PNG, JPG, or WebP · max 5 MB</p>
          </div>
        </div>
      </div>

      {/* ── Form fields ── */}
      <div className="space-y-5">
        <div>
          <label className={labelCls}>Business Name</label>
          <input
            type="text"
            value={form.business_name}
            onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
            placeholder="e.g. Lakeside Properties"
            className={inputCls}
          />
          <p className="text-xs text-gray-400 mt-1">
            Shown as your workspace name. If left blank, your first name is used instead.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First Name</label>
            <input
              type="text"
              value={form.first_name}
              onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              placeholder="Jane"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input
              type="text"
              value={form.last_name}
              onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              placeholder="Smith"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={email}
            disabled
            className={`${inputCls} bg-gray-50 text-gray-400 cursor-not-allowed`}
          />
          <p className="text-xs text-gray-400 mt-1">
            Contact support to change your email address.
          </p>
        </div>

        <div>
          <label className={labelCls}>Phone Number</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+1 555 000 0000"
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <div className="mt-5 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-7 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-[#008080] text-white text-sm font-semibold rounded-lg hover:bg-[#006666] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Profile saved!</span>
        )}
      </div>
    </div>
  );
}

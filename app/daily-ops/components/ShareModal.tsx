// components/ShareModal.tsx
'use client';

import { useState } from 'react';
import { CleanerShare } from '@/lib/supabase/types';

interface ShareModalProps {
  propertyId: string;
  shares: CleanerShare[];
  onCreateShare: (name: string, expiresAt?: Date) => Promise<CleanerShare | null>;
  onDeactivateShare: (shareId: string) => Promise<void>;
  onClose: () => void;
}

export default function ShareModal({
  propertyId,
  shares,
  onCreateShare,
  onDeactivateShare,
  onClose,
}: ShareModalProps) {
  const [newShareName, setNewShareName] = useState('');
  const [expiresIn, setExpiresIn] = useState<string>('never');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeShares = shares.filter(s => s.is_active);

  const handleCreate = async () => {
    setCreating(true);
    
    let expiresAt: Date | undefined;
    if (expiresIn !== 'never') {
      expiresAt = new Date();
      const days = parseInt(expiresIn);
      expiresAt.setDate(expiresAt.getDate() + days);
    }

    await onCreateShare(newShareName || 'Cleaner', expiresAt);
    setNewShareName('');
    setExpiresIn('never');
    setCreating(false);
  };

  const handleCopy = async (token: string, shareId: string) => {
    const shareUrl = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
  };
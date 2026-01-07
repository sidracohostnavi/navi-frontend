// app/daily-ops/components/ShareModal.tsx
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

  const activeShares = shares.filter((s) => s.is_active);

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

  const handleDeactivate = async (shareId: string) => {
    if (confirm('Are you sure? The cleaner will lose access to the calendar.')) {
      await onDeactivateShare(shareId);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto relative shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
          onClick={onClose}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Share with Cleaner
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Create a link for your cleaner to view booking dates and guest counts
          (no names).
        </p>

        {/* Create new share */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Create New Link
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,140px] gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Name (optional)
              </label>
              <input
                type="text"
                placeholder="e.g., Maria's Cleaning"
                value={newShareName}
                onChange={(e) => setNewShareName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Expires
              </label>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="never">Never</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
              </select>
            </div>
          </div>
          <button
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create Share Link'}
          </button>
        </div>

        {/* Active shares */}
        {activeShares.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Active Links
            </h3>
            <div className="space-y-3">
              {activeShares.map((share) => (
                <div
                  key={share.id}
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {share.name || 'Unnamed'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Created {formatDate(share.created_at)}
                      {share.expires_at &&
                        ` · Expires ${formatDate(share.expires_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 transition-colors"
                      onClick={() => handleCopy(share.token, share.id)}
                    >
                      {copiedId === share.id ? (
                        <>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-md hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                      onClick={() => handleDeactivate(share.id)}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
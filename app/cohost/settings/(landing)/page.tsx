'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SIDEBAR_PERMISSION_MAP, getPermissionsForRole, type FeaturePermissions } from '@/lib/roles/roleConfig';
import { SETTINGS_NAV_ITEMS } from '../constants';

export default function CoHostSettingsLandingPage() {
  const router = useRouter();
  const [permissions, setPermissions] = useState<FeaturePermissions | null>(null);

  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/cohost/users/role');
        if (res.ok) {
          const data = await res.json();
          const perms = getPermissionsForRole(data.role);
          setPermissions(perms);
          if (!perms.canViewSettingsTab) {
            router.replace('/cohost/settings/profile');
          }
        }
      } catch { }
    }
    checkAccess();
  }, [router]);

  const visibleItems = permissions
    ? SETTINGS_NAV_ITEMS.filter(item => {
        const permKey = SIDEBAR_PERMISSION_MAP[item.href];
        if (!permKey) return true;
        return permissions[permKey];
      })
    : [];

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
          <p className="text-lg text-gray-500 mt-2">Manage your workspace configuration and preferences</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-xl hover:border-blue-100 hover:-translate-y-1 transition-all duration-300 group flex flex-col"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className={`p-2.5 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors ${item.color}`}>
                  <item.icon className="w-5 h-5" />
                </div>
                <h2 className="text-base font-bold text-gray-900 group-hover:text-blue-600 transition-colors uppercase tracking-wide">
                  {item.name}
                </h2>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">
                {item.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

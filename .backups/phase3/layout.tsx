'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useReviewCount } from '@/lib/supabase/hooks/useReviewCount';
import { getPermissionsForRole, type FeaturePermissions } from '@/lib/roles/roleConfig';
import type { User } from '@supabase/supabase-js';

export default function CohostLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null); // null = loading
  const [userPerms, setUserPerms] = useState<FeaturePermissions | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { count: reviewCount } = useReviewCount();

  // Pages that should NOT show the full CoHost nav
  const isStandalonePage = pathname.startsWith('/cohost/invite');

  useEffect(() => {
    // Check initial session
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Check workspace access (skip for standalone pages)
      if (user && !isStandalonePage) {
        try {
          const res = await fetch('/api/cohost/users/role');
          if (res.ok) {
            const data = await res.json();
            setHasWorkspace(true);
            setUserPerms(getPermissionsForRole(data.role || 'cleaner'));
          } else {
            setHasWorkspace(false);
          }
        } catch {
          setHasWorkspace(false);
        }
      } else if (!user) {
        setHasWorkspace(false);
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // Close dropdown on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push('/');
  };

  // Helper to determine active state
  const isActive = (path: string) => {
    if (path === '/cohost/dashboard' && pathname === '/cohost') return false;
    return pathname.startsWith(path);
  };

  // Avatar Initials Logic
  const getInitials = () => {
    if (!user) return 'U';
    const meta = user.user_metadata || {};
    if (meta.company_name) return meta.company_name.slice(0, 2).toUpperCase();
    if (meta.first_name && meta.last_name) return (meta.first_name[0] + meta.last_name[0]).toUpperCase();
    if (meta.first_name) return meta.first_name.slice(0, 2).toUpperCase();
    if (meta.full_name) {
      const parts = meta.full_name.trim().split(' ');
      if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const initials = getInitials();

  // For standalone pages (invite), render without nav
  if (isStandalonePage) {
    return <>{children}</>;
  }

  // If user has no workspace, show minimal page (no nav to browse)
  if (hasWorkspace === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Access</h2>
          <p className="text-gray-500 mb-4">You don&apos;t have access to CoHost. If you were invited, please use your invite link.</p>
          <button onClick={handleSignOut} className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        /* Hide the global Naviverse navbar when inside cohost routes */
        body > nav {
          display: none !important;
        }
        /* Reset the top padding added by the global layout for the fixed navbar */
        body > main {
          padding-top: 0 !important;
        }
      `}</style>

      <div className="flex flex-col min-h-screen bg-gray-50">
        {/* CoHost Header */}
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
          <div className="w-full px-6">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center gap-2">
                  {/* CoHost Mascot Icon */}
                  <Image
                    src="/mascots/cohost.png"
                    alt="Navi CoHost Mascot"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-full object-cover"
                  />
                  <span className="text-xl font-bold text-[#FF5A5F] tracking-tight">
                    Navi CoHost
                  </span>
                </div>
                <nav className="hidden sm:ml-8 sm:flex sm:space-x-8">
                  {[
                    { href: '/cohost/dashboard', label: 'Dashboard', perm: 'canViewDashboard' as keyof FeaturePermissions },
                    { href: '/cohost/properties', label: 'Properties', perm: 'canViewProperties' as keyof FeaturePermissions },
                    { href: '/cohost/calendar', label: 'Calendar', perm: 'canViewCalendar' as keyof FeaturePermissions },
                    { href: '/cohost/messaging', label: 'Messaging', perm: 'canViewMessaging' as keyof FeaturePermissions },
                    { href: '/cohost/settings', label: 'Settings', perm: 'canViewSettingsTab' as keyof FeaturePermissions },
                  ]
                    .filter(item => !userPerms || userPerms[item.perm])
                    .map(item => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${isActive(item.href)
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                          }`}
                      >
                        {item.label}
                      </Link>
                    ))
                  }
                </nav>
              </div>
              <div className="flex items-center">
                <div className="ml-4 flex items-center md:ml-6">
                  {/* Review Inbox Button */}
                  <Link
                    href="/cohost/review"
                    className="relative bg-gray-100 p-1 rounded-full text-gray-400 hover:text-gray-600 focus:outline-none mr-2"
                    title="Review Inbox"
                  >
                    <span className="sr-only">View review items</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    {reviewCount > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full min-w-[18px]">
                        {reviewCount > 99 ? '99+' : reviewCount}
                      </span>
                    )}
                  </Link>

                  {/* Notification Button */}
                  <button className="bg-gray-100 p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none">
                    <span className="sr-only">View notifications</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </button>

                  {/* Profile Dropdown */}
                  <div className="ml-3 relative" ref={dropdownRef}>
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="bg-indigo-100 h-8 w-8 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs border border-indigo-200 hover:ring-2 hover:ring-offset-2 hover:ring-indigo-500 transition-all focus:outline-none"
                      aria-expanded={isDropdownOpen}
                      aria-haspopup="true"
                    >
                      {initials}
                    </button>

                    {/* Dropdown Menu */}
                    {isDropdownOpen && (
                      <div
                        className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 py-1 focus:outline-none z-[100]"
                        role="menu"
                        aria-orientation="vertical"
                        aria-labelledby="user-menu-button"
                      >
                        <Link
                          href="/cohost/settings/profile"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          Profile
                        </Link>
                        {(!userPerms || userPerms.canViewBilling) && (
                          <Link
                            href="/cohost/settings/billing"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            role="menuitem"
                            onClick={() => setIsDropdownOpen(false)}
                          >
                            Plans & Billing
                          </Link>
                        )}
                        {(!userPerms || userPerms.canManageTeam) && (
                          <Link
                            href="/cohost/settings/team"
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            role="menuitem"
                            onClick={() => setIsDropdownOpen(false)}
                          >
                            Team
                          </Link>
                        )}
                        <Link
                          href="/cohost/settings/support"
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                          onClick={() => setIsDropdownOpen(false)}
                        >
                          Support
                        </Link>
                        <button
                          onClick={handleSignOut}
                          className="w-full text-left block px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          role="menuitem"
                        >
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header >

        <main className="flex-1">
          {children}
        </main>
      </div >
    </>
  );
}
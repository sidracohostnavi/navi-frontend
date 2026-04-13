'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PropertyLayout({ 
  children, 
  params 
}: { 
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const [property, setProperty] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchProperty = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('cohost_properties')
        .select('name, city, state, direct_booking_enabled, slug')
        .eq('id', id)
        .single();
      if (data) setProperty(data);
    };
    fetchProperty();
  }, [id]);

  const tabs = [
    { id: 'settings', label: 'Details & Settings', href: `/cohost/properties/${id}/settings` },
    { id: 'description', label: 'Description', href: `/cohost/properties/${id}/description` },
    { id: 'photos', label: 'Photos', href: `/cohost/properties/${id}/photos` },
    { id: 'pricing', label: 'Pricing & Availability', href: `/cohost/properties/${id}/pricing` },
    { id: 'direct-booking', label: 'Direct Bookings', href: `/cohost/properties/${id}/direct-booking` },
  ];

  const isTabActive = (href: string) => {
    if (href === `/cohost/properties/${id}`) {
        return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/cohost/properties" className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{property?.name || 'Loading...'}</h1>
              <p className="text-xs text-gray-500">
                {property ? `${property.city}, ${property.state}` : '...'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link 
              href={`/cohost/calendar?propertyId=${id}`} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Calendar
            </Link>
            {property?.slug ? (
              <a
                href={`/book/${property.slug}?preview=true`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm font-medium text-[#008080] bg-[#008080]/5 hover:bg-[#008080]/10 rounded-lg flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Preview Listing
              </a>
            ) : (
              <span className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed" title="Set a URL slug in Direct Bookings to preview">
                Preview Listing
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 flex gap-6 overflow-x-auto">
          {tabs.map(tab => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`py-3 text-sm border-b-2 transition-all whitespace-nowrap ${
                isTabActive(tab.href)
                  ? 'border-[#008080] text-[#008080] font-bold'
                  : 'border-transparent text-gray-500 font-medium hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.id === 'direct-booking' && property ? (
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${property.direct_booking_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {property.direct_booking_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </span>
              ) : tab.label}
            </Link>
          ))}
        </div>
      </header>

      <main>
        {children}
      </main>
    </div>
  );
}

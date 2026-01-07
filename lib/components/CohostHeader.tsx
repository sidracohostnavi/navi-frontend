// /lib/components/CohostHeader.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/contexts/AuthContext'

export function CohostHeader() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  
  async function handleSignOut() {
    await signOut()
    router.push('/cohost/login')
  }
  
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo / Brand */}
          <div className="flex items-center">
            <Link href="/cohost/messaging/inbox" className="text-xl font-bold text-blue-600">
              CoHost
            </Link>
          </div>
          
          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              href="/cohost/messaging/inbox" 
              className="text-gray-600 hover:text-gray-900"
            >
              Inbox
            </Link>
            <Link 
              href="/cohost/settings" 
              className="text-gray-600 hover:text-gray-900"
            >
              Settings
            </Link>
          </nav>
          
          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Menu, X, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    // Create supabase client
    const supabase = createClient();

    useEffect(() => {
        setMounted(true);
        // Check initial session
        const checkUser = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                setUser(user);
            } catch (error) {
                console.error('Error checking auth:', error);
            } finally {
                setLoading(false);
            }
        };

        checkUser();

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [supabase]);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.refresh();
        setUser(null); // Optimistic update
    };

    // Simple active link check
    const isActive = (path: string) => pathname === path;

    // Don't render auth state during SSR to avoid hydration mismatch
    // (Though simple showing/hiding links is usually fine, specific user details need wait)
    // We'll show a loading placeholder or default to signed out until loaded on client

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Left: Logo */}
                <div className="flex-shrink-0">
                    <Link href="/" className="text-xl font-bold tracking-tight text-gray-900">
                        NaviVerse.ai
                    </Link>
                </div>

                {/* Center: Navigation (Desktop) */}
                <div className="hidden md:flex items-center space-x-8">
                    <Link
                        href="/agents"
                        className={cn(
                            "text-sm font-medium transition-colors hover:text-black",
                            isActive('/agents') ? "text-black" : "text-gray-500"
                        )}
                    >
                        Agents
                    </Link>
                    <Link
                        href="/pulse"
                        className={cn(
                            "text-sm font-medium transition-colors hover:text-black",
                            isActive('/pulse') ? "text-black" : "text-gray-500"
                        )}
                    >
                        The Pulse
                    </Link>
                    <Link
                        href="/constellation"
                        className={cn(
                            "text-sm font-medium transition-colors hover:text-black",
                            isActive('/constellation') ? "text-black" : "text-gray-500"
                        )}
                    >
                        The Constellation
                    </Link>
                </div>

                {/* Right: Auth & CTA (Desktop) */}
                <div className="hidden md:flex items-center space-x-6">
                    {loading ? (
                        // Loading skeleton or empty
                        <div className="w-20 h-8 animate-pulse bg-gray-100 rounded" />
                    ) : user ? (
                        <>
                            <Link
                                href="/dashboard"
                                className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
                            >
                                Dashboard
                            </Link>
                            <button
                                onClick={handleSignOut}
                                className="text-sm font-medium text-gray-500 hover:text-red-600 transition-colors"
                            >
                                Sign Out
                            </button>
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                                <User size={16} className="text-gray-500" />
                            </div>
                        </>
                    ) : (
                        <>
                            <Link
                                href="/auth/login"
                                className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
                            >
                                Sign In
                            </Link>
                            <Link
                                href="/auth/signup"
                                className="bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800 transition-all"
                            >
                                Join NaviVerse
                            </Link>
                        </>
                    )}
                </div>

                {/* Mobile Menu Toggle */}
                <div className="md:hidden">
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="text-gray-600 hover:text-black focus:outline-none"
                    >
                        {isOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <div className="md:hidden bg-white border-t border-gray-100 absolute w-full px-6 py-4 flex flex-col space-y-4 shadow-lg">
                    <Link
                        href="/agents"
                        className="text-base font-medium text-gray-600 hover:text-black"
                        onClick={() => setIsOpen(false)}
                    >
                        Agents
                    </Link>
                    <Link
                        href="/pulse"
                        className="text-base font-medium text-gray-600 hover:text-black"
                        onClick={() => setIsOpen(false)}
                    >
                        The Pulse
                    </Link>
                    <Link
                        href="/constellation"
                        className="text-base font-medium text-gray-600 hover:text-black"
                        onClick={() => setIsOpen(false)}
                    >
                        The Constellation
                    </Link>

                    <div className="pt-4 border-t border-gray-100 flex flex-col space-y-4">
                        {user ? (
                            <>
                                <Link
                                    href="/dashboard"
                                    className="text-base font-medium text-gray-900 hover:text-black"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Go to Dashboard
                                </Link>
                                <button
                                    onClick={() => {
                                        handleSignOut();
                                        setIsOpen(false);
                                    }}
                                    className="text-base font-medium text-gray-500 hover:text-red-600 text-left"
                                >
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href="/auth/login"
                                    className="text-base font-medium text-gray-600 hover:text-black"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Sign In
                                </Link>
                                <Link
                                    href="/auth/signup"
                                    className="bg-black text-white text-center text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800"
                                    onClick={() => setIsOpen(false)}
                                >
                                    Join NaviVerse
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}

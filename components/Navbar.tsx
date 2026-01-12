'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function Navbar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Simple active link check
    const isActive = (path: string) => pathname === path;

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
                    <Link
                        href="/auth/signin"
                        className="text-sm font-medium text-gray-600 hover:text-black transition-colors"
                    >
                        Sign In
                    </Link>
                    <Link
                        href="/join"
                        className="bg-black text-white text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800 transition-all"
                    >
                        Join NaviVerse
                    </Link>
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
                        <Link
                            href="/auth/signin"
                            className="text-base font-medium text-gray-600 hover:text-black"
                            onClick={() => setIsOpen(false)}
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/join"
                            className="bg-black text-white text-center text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-800"
                            onClick={() => setIsOpen(false)}
                        >
                            Join NaviVerse
                        </Link>
                    </div>
                </div>
            )}
        </nav>
    );
}

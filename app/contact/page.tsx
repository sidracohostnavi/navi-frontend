'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ContactPage() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, message }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to send message');
            setSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Simple nav */}
            <nav className="bg-white border-b border-gray-100 px-6 py-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <Link href="/">
                        <img src="/cohost-logo-full.png" alt="Navi CoHost" className="h-10 w-auto object-contain" />
                    </Link>
                    <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-700 transition">
                        Sign In
                    </Link>
                </div>
            </nav>

            <div className="flex-1 flex items-center justify-center px-4 py-16">
                <div className="max-w-md w-full">
                    {success ? (
                        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                            <div className="text-4xl mb-4">✓</div>
                            <h1 className="text-xl font-semibold text-gray-800 mb-2">Message sent!</h1>
                            <p className="text-sm text-gray-500 mb-6">
                                Thanks for reaching out. We&apos;ll get back to you shortly.
                            </p>
                            <Link
                                href="/"
                                className="text-sm text-[#FA5A5A] hover:underline"
                            >
                                Back to home
                            </Link>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl shadow-sm p-8">
                            <div className="text-center mb-8">
                                <h1 className="text-2xl font-semibold text-gray-900 mb-2">Request Access</h1>
                                <p className="text-sm text-gray-500">
                                    Navi CoHost is in early access. Tell us a bit about yourself and we&apos;ll be in touch.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                        Your Name
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        placeholder="Jane Doe"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FA5A5A] focus:ring-2 focus:ring-[#FA5A5A]/20"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                                        Email Address
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="you@example.com"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FA5A5A] focus:ring-2 focus:ring-[#FA5A5A]/20"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                                        Tell us about your hosting
                                    </label>
                                    <textarea
                                        id="message"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        required
                                        rows={4}
                                        placeholder="How many properties do you manage? Which platforms do you use?"
                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#FA5A5A] focus:ring-2 focus:ring-[#FA5A5A]/20 resize-none"
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                        <p className="text-sm text-red-600">{error}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 bg-[#FA5A5A] hover:bg-[#e04848] text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? 'Sending...' : 'Send Message'}
                                </button>
                            </form>

                            <p className="text-center text-xs text-gray-400 mt-6">
                                Already have an account?{' '}
                                <Link href="/auth/login" className="text-[#FA5A5A] hover:underline">
                                    Sign in
                                </Link>
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

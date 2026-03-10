import Link from 'next/link';

export default function CoHostLandingPage() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#FA5A5A]/10 to-white">
            {/* Navigation */}
            <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-sm border-b border-[#FA5A5A]/20 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <img src="/cohost-mascot.png" alt="Navi CoHost" className="h-8 w-auto object-contain shrink-0" />
                        <span className="text-xl font-semibold text-[#FA5A5A] truncate hidden sm:block">Navi CoHost</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/auth/login" className="text-gray-600 hover:text-gray-900 transition">
                            Sign In
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="bg-[#FA5A5A] hover:bg-[#e04848] text-white px-5 py-2 rounded-full font-medium transition"
                        >
                            Start Free
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <p className="text-[#FA5A5A] font-medium mb-4">Built by a real host who understands the chaos of managing bookings.</p>
                    <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                        A Smarter Way to Host
                    </h1>
                    <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                        Keep your bookings, guest messages, and cleaning perfectly organized.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
                        <Link
                            href="/auth/signup"
                            className="bg-[#FA5A5A] hover:bg-[#e04848] text-white px-8 py-4 rounded-full font-semibold text-lg transition shadow-lg shadow-[#FA5A5A]/30"
                        >
                            Start Hosting Smarter
                        </Link>
                    </div>
                    <p className="text-gray-500 text-sm">
                        Works with Airbnb, VRBO, Booking.com and any platform using iCal.
                    </p>
                </div>
            </section>

            {/* Problem Section */}
            <section className="py-20 px-6 bg-white">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-8">
                        Hosting Shouldn't Feel Chaotic
                    </h2>
                    <p className="text-gray-600 text-center text-lg mb-8">
                        Hosts juggle too many things every day:
                    </p>
                    <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        {[
                            'Checking multiple calendars',
                            'Remembering guest messages',
                            'Coordinating cleaning',
                            'Avoiding booking mistakes'
                        ].map((item, i) => (
                            <div key={i} className="flex items-center gap-3 text-gray-700">
                                <span className="text-[#FA5A5A]">✗</span>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-lg text-gray-700 mt-10 font-medium">
                        Navi brings everything into one calm system.
                    </p>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 px-6 bg-[#FA5A5A]/5">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-16">
                        Everything You Need to Stay Organized
                    </h2>

                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Feature 1 */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm">
                            <div className="text-4xl mb-4">📅</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Unified Calendar</h3>
                            <p className="text-gray-600 mb-4">See all your bookings in one clear timeline.</p>
                            <div className="flex flex-wrap gap-2">
                                {['Airbnb', 'VRBO', 'Direct bookings', 'Cleaning blocks'].map((tag) => (
                                    <span key={tag} className="bg-[#FA5A5A]/10 text-[#FA5A5A] px-3 py-1 rounded-full text-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm">
                            <div className="text-4xl mb-4">💬</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Guest Messaging Made Simple</h3>
                            <p className="text-gray-600 mb-4">Automate reminders and important guest messages.</p>
                            <div className="flex flex-wrap gap-2">
                                {['Check-in instructions', 'Review requests', 'Follow-ups'].map((tag) => (
                                    <span key={tag} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm">
                            <div className="text-4xl mb-4">🧹</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Cleaning & Turnover Coordination</h3>
                            <p className="text-gray-600 mb-4">Know exactly when your property needs attention.</p>
                            <div className="flex flex-wrap gap-2">
                                {['Automatic turnover tracking', 'Cleaner notifications'].map((tag) => (
                                    <span key={tag} className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Feature 4 */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm">
                            <div className="text-4xl mb-4">🔗</div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-3">Works With Any STR Platform</h3>
                            <p className="text-gray-600 mb-4">Navi syncs through iCal calendar feeds.</p>
                            <div className="flex flex-wrap gap-2">
                                {['Airbnb', 'VRBO', 'Booking.com', 'Direct bookings'].map((tag) => (
                                    <span key={tag} className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-20 px-6 bg-white">
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-16">
                        How Navi Works
                    </h2>

                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                step: '1',
                                title: 'Connect Your Calendars',
                                description: 'Paste your Airbnb or other platform iCal links.'
                            },
                            {
                                step: '2',
                                title: 'Navi Organizes Everything',
                                description: 'Bookings, messages, and cleaning schedules appear automatically.'
                            },
                            {
                                step: '3',
                                title: 'Host With Confidence',
                                description: 'Spend less time managing operations and more time welcoming guests.'
                            }
                        ].map((item) => (
                            <div key={item.step} className="text-center">
                                <div className="w-12 h-12 bg-[#FA5A5A] text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                                    {item.step}
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                                <p className="text-gray-600">{item.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Trust Section */}
            <section className="py-20 px-6 bg-[#FA5A5A]/5">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                        Built by a Host, for Hosts
                    </h2>
                    <p className="text-lg text-gray-600">
                        Navi was created by a host who understands the daily challenges of running short-term rentals.
                        Our goal is simple: make hosting calm, organized, and reliable.
                    </p>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-20 px-6 bg-white">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-12">
                        Frequently Asked Questions
                    </h2>

                    <div className="space-y-6">
                        {[
                            {
                                q: 'Does Navi work with Airbnb?',
                                a: 'Yes. Navi syncs with Airbnb using iCal calendar feeds.'
                            },
                            {
                                q: 'What platforms are supported?',
                                a: 'Any short-term rental platform that provides an iCal calendar feed, including Airbnb, VRBO, Booking.com, direct booking sites, and many PMS tools.'
                            },
                            {
                                q: 'Do calendars update automatically?',
                                a: 'Yes. Navi regularly syncs with your iCal feeds to keep bookings up to date.'
                            },
                            {
                                q: 'Can my cleaner access the schedule?',
                                a: 'Yes. You can invite cleaners to view turnover schedules and receive notifications.'
                            },
                            {
                                q: 'Is Navi beginner friendly?',
                                a: 'Absolutely. Navi is designed to be simple and intuitive. Get organized in minutes, not hours.'
                            }
                        ].map((faq, i) => (
                            <div key={i} className="border-b border-gray-200 pb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">{faq.q}</h3>
                                <p className="text-gray-600">{faq.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section className="py-20 px-6 bg-gradient-to-b from-[#FA5A5A]/20 to-[#FA5A5A]/5">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                        Start Hosting Smarter Today
                    </h2>
                    <Link
                        href="/auth/signup"
                        className="inline-block bg-[#FA5A5A] hover:bg-[#e04848] text-white px-10 py-4 rounded-full font-semibold text-lg transition shadow-lg shadow-[#FA5A5A]/30"
                    >
                        Create Your Free Account
                    </Link>
                    <p className="text-gray-500 mt-4">Get organized in minutes.</p>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-10 px-6 bg-white border-t border-gray-100">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <img src="/cohost-mascot.png" alt="Navi CoHost" className="h-6 w-auto object-contain shrink-0 grayscale opacity-60" />
                        <span className="text-gray-600 font-medium whitespace-nowrap">Navi CoHost</span>
                    </div>
                    <p className="text-gray-400 text-sm">
                        © 2026 Navi CoHost. Made with ❤️ for hosts.
                    </p>
                </div>
            </footer>
        </div>
    );
}

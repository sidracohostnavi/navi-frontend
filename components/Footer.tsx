import Link from 'next/link';

export function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer className="bg-white border-t border-gray-100 py-12">
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">

                {/* Copyright */}
                <div className="text-sm text-gray-500">
                    © {currentYear} NaviVerse.ai. All rights reserved.
                </div>

                {/* Links */}
                <div className="flex items-center space-x-6">
                    <Link href="/privacy" className="text-sm text-gray-500 hover:text-black transition-colors">
                        Privacy
                    </Link>
                    <Link href="/terms" className="text-sm text-gray-500 hover:text-black transition-colors">
                        Terms
                    </Link>
                    <Link href="/contact" className="text-sm text-gray-500 hover:text-black transition-colors">
                        Contact
                    </Link>
                </div>

            </div>
        </footer>
    );
}

// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    '/',
    '/auth/login',
    '/auth/signup',
    '/auth/callback',
    '/entry', // Entry handles its own auth check
    '/cohost', // Public Landing Page
]

// Routes that should be ignored by middleware
const IGNORED_PATTERNS = [
    '/_next',
    '/favicon.ico',
    '/api',
    '/static',
]

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Skip middleware for ignored patterns
    if (IGNORED_PATTERNS.some(pattern => pathname.startsWith(pattern))) {
        return NextResponse.next()
    }

    // Skip middleware for public routes
    if (PUBLIC_ROUTES.includes(pathname)) {
        return NextResponse.next()
    }

    // Create Supabase client for middleware
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // Check if user is authenticated
    const { data: { user }, error } = await supabase.auth.getUser()

    // If no user and not on a public route, redirect to login
    if (!user || error) {
        const redirectUrl = new URL('/auth/login', request.url)
        redirectUrl.searchParams.set('next', pathname)
        return NextResponse.redirect(redirectUrl)
    }

    // User is authenticated, allow access
    return response
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}

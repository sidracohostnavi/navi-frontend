# System Snapshot: Authentication System
**Date:** January 28, 2026
**Version:** 1.0.0
**Status:** Stable (Production Ready)

## 1. Overview
The Authentication system is built on **Supabase Auth** (GoTrue), utilizing both OAuth (Google) and Email/Password strategies. It enforces session security via Next.js Middleware and server-side route protection.

## 2. Component Inventory

### User Interface
| Component | Path | Description |
|-----------|------|-------------|
| **Login Page** | `app/auth/login/page.tsx` | Entry point. Supports Google OAuth and Email/Password. Handles `?next` redirection. Wrapped in Suspense. |
| **Signup Page** | `app/auth/signup/page.tsx` | Registration flow (mirrors login but for new users). |

### Backend Handlers
| Handler | Path | Description |
|---------|------|-------------|
| **Callback Route** | `app/auth/callback/route.ts` | The OAuth2 redirect handler. Exchanges `code` for session, handles `token_hash` (Magic links), and redirects user to dashboard. |
| **Middleware** | `middleware.ts` | Global edge middleware. Intercepts all requests. Redirects unauthenticated users to `/auth/login` unless route is in `PUBLIC_ROUTES`. |

### Database & Config
| Item | Details |
|------|---------|
| **Provider** | Supabase Auth (AWS Cognito / GoTrue under the hood). |
| **Strategies** | Google (OAuth), Email (Password). |
| **Session** | JWT-based, managed via Cookies (`sb-access-token`, `sb-refresh-token`). |
| **Public Routes** | `/`, `/auth/*`, `/entry`, `/cohost` (Landing). |

## 3. Data Flow

### Login Flow
1. User visits `/auth/login`.
2. **Option A (Google):** 
   - Calls `signInWithOAuth`.
   - Redirects to Google.
   - Google redirects to `/auth/callback`.
   - Callback exchanges code for cookies.
   - Redirects to `/dashboard`.
3. **Option B (Email):**
   - Calls `signInWithPassword`.
   - Supabase returns session.
   - Client redirects to `/dashboard`.

### Protection Flow
1. User requests `/cohost/calendar`.
2. `middleware.ts` intercepts.
3. Calls `supabase.auth.getUser()`.
4. If no user -> Redirects to `/auth/login?next=/cohost/calendar`.
5. If user exists -> `NextResponse.next()`.

## 4. Key Configurations
- **Next Param:** Used to preserve deep links after login.
- **PKCE:** Proof Key for Code Exchange is enabled for security.
- **SSR:** Used in middleware and generic server actions to validate session.

## 5. Security Posture
- **CSRF:** Supabase handles CSRF tokens.
- **Cookie Security:** HttpOnly, Secure, SameSite=Lax.
- **Route Guards:** Double-layer protection (Middleware + RLS in DB).

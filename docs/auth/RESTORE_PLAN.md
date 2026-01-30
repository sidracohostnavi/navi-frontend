# Authentication Restoration & Recovery
**Primary Owner:** Engineering Team

Procedures for resolving authentication outages or user lockout scenarios.

## Level 1: User Cannot Login (Individual)
**Symptoms:** "Invalid login credentials", Infinite redirect loop, or "Auth session missing".

### Troubleshooting Steps
1. **Clear Cookies:** Ask user to clear site cookies/cache. Old/malformed tokens are a common cause.
2. **Check Browser Time:** Verify user's system clock is correct (JWT expiry validation depends on this).
3. **Verify Provider:**
   - If Google: Is the Google Cloud Console credential active?
   - If Email: Has the user confirmed their email (if required)?

## Level 2: OAuth Failure (System Wide)
**Symptoms:** All Google logins failing with "OAuth Error" or 400 Bad Request.

### Diagnosis & Restore
1. **Check Google Cloud Console:**
   - Ensure "Authorized redirect URIs" matches the production domain: `https://navicohost.com/auth/callback`.
   - Ensure `localhost:3000/auth/callback` is authorized for dev.
2. **Check Supabase Config:**
   - Verify `Google Client ID` and `Secret` in Supabase Authentication -> Providers.
   - If secrets were rotated, update them immediately in Supabase.

## Level 3: Session Persistence Failure (Infinite Loops)
**Symptoms:** Users log in, are redirected to Dashboard, then immediately redirected back to Login.

### Diagnosis
- **Cookie Domain Mismatch:** Check if `cookieOptions` in `createClient` match the current domain.
- **Middleware Logic:** Review `middleware.ts`. Is it correctly detecting the session?
   - *Fix:* Ensure `createServerClient` in middleware has correct cookie read/write logic (it must copy request cookies to response).

## Level 4: Emergency Access
**Scenario:** Admin locked out of production.

### Restore
1. Access Supabase Dashboard directly.
2. Manually trigger a "Send Password Reset" to the admin email.
3. Or, insert a temporary user via SQL (Not recommended, bypasses auth triggers).

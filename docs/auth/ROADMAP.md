# Authentication Product Roadmap

## Phase 1: Foundation (Completed)
- [x] **Core Auth:** Email/Password & Google OAuth.
- [x] **Session Management:** Secure HttpOnly cookies.
- [x] **Route Protection:** Edge Middleware.
- [x] **Redirects:** Deep link preservation via `?next`.

## Phase 2: Enhanced Security (Current)
- [ ] **MFA (Multi-Factor Auth):** Implement TOTP (Authenticator App) for higher security accounts.
- [ ] **Session Timeout:** Enforce periodic re-login (e.g., 2 weeks) or activity-based invalidation.
- [ ] **Audit Logs:** Track "Login Success", "Login Failed", and "Password Reset" events in a visible `auth_logs` table for admins.

## Phase 3: Enterprise Features
- [ ] **SSO (Single Sign-On):** SAML support for enterprise clients (if applicable).
- [ ] **RBAC (Role Based Access):** Formalize "Manager" vs "Cleaner" vs "Owner" roles within a Workspace.
- [ ] **Team Invites:** Email invitation flow to join existing workspaces.

## Phase 4: User Experience
- [ ] **Social Avatars:** Auto-sync user profile picture from Google.
- [ ] **Magic Links:** Allow "Login with Magic Link" (Passwordless) for simpler access.

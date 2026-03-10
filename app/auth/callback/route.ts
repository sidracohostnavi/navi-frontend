// app/auth/callback/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as any; // 'signup' | 'email' | 'recovery' | 'invite'

  // Default redirect depends on which domain we're on
  const isCoHost = requestUrl.origin.includes('cohostnavi.com') || requestUrl.origin.includes('localhost:3000');
  const defaultNext = isCoHost ? '/cohost/calendar' : '/dashboard';

  const next = requestUrl.searchParams.get('next') || defaultNext;
  const error_description = requestUrl.searchParams.get('error_description');

  if (error_description) {
    console.error('Auth Callback Error:', error_description);
    return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error_description)}`);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, {
              ...options,
              secure: process.env.NODE_ENV === 'production',
            });
          });
        },
      },
    }
  );

  // Case 1: Handle "PKCE" Auth Code (OAuth or newer Email flows)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log('[Auth Callback] Code exchange success');

      // Create Workspace on user's first login
      const { data: { session } } = await supabase.auth.getSession();

      if (isCoHost && session?.user) {
        const userId = session.user.id;
        const userEmail = session.user.email;

        // Import the service role client (bypasses RLS)
        const { createCohostServiceClient } = await import('@/lib/supabase/cohostServer');
        const adminClient = createCohostServiceClient();

        // SAFETY CHECK 1: Does user already own a workspace?
        const { data: existingOwnership } = await adminClient
          .from('cohost_workspace_members')
          .select('workspace_id')
          .eq('user_id', userId)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();

        if (!existingOwnership) {
          // User doesn't own a workspace yet — create one

          // SAFETY CHECK 2: Double-check no workspace with this creator exists
          const { data: existingWorkspace } = await adminClient
            .from('cohost_workspaces')
            .select('id')
            .eq('owner_id', userId)
            .limit(1)
            .maybeSingle();

          if (!existingWorkspace) {
            // Create workspace with transaction-like safety
            const workspaceName = userEmail
              ? `${userEmail.split('@')[0]}'s Properties`
              : 'My Properties';

            // Step 1: Create workspace
            const { data: newWorkspace, error: wsError } = await adminClient
              .from('cohost_workspaces')
              .insert({
                name: workspaceName,
                slug: `ws-${userId}`,
                owner_id: userId,
              })
              .select('id')
              .single();

            if (wsError || !newWorkspace) {
              console.error('[Auth Callback] Failed to create workspace:', wsError);
            } else {
              // Step 2: Add user as owner
              const { error: memberError } = await adminClient
                .from('cohost_workspace_members')
                .insert({
                  workspace_id: newWorkspace.id,
                  user_id: userId,
                  role: 'owner',
                });

              if (memberError) {
                console.error('[Auth Callback] Failed to add workspace member:', memberError);
                // Rollback: delete the orphaned workspace
                await adminClient
                  .from('cohost_workspaces')
                  .delete()
                  .eq('id', newWorkspace.id);
              } else {
                // Step 3: Create default automation settings
                const { error: settingsError } = await adminClient
                  .from('cohost_automation_settings')
                  .insert({
                    workspace_id: newWorkspace.id,
                    automation_level: 1, // Add any default settings fields here
                  });

                if (settingsError) {
                  console.error('[Auth Callback] Failed to create automation settings:', settingsError);
                }

                console.log('[Auth Callback] Created workspace for new user:', userId, newWorkspace.id);
              }
            }
          }
        }
      }

      console.log('[Auth Callback] Redirecting to:', next);
      // Ensure we don't double-slash or mess up query params
      const target = next.startsWith('http') ? next : `${requestUrl.origin}${next}`;
      console.log('[Auth Callback] Final Target URL:', target);
      return NextResponse.redirect(target);
    } else {
      console.error('Auth Code Exchange Error:', error);
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Case 2: Handle "Token Hash" (Implicit/MagicLink/Email types)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    })
    if (!error) {

      // Create Workspace on user's first login
      const { data: { session } } = await supabase.auth.getSession();

      if (isCoHost && session?.user) {
        const userId = session.user.id;
        const userEmail = session.user.email;

        // Import the service role client (bypasses RLS)
        const { createCohostServiceClient } = await import('@/lib/supabase/cohostServer');
        const adminClient = createCohostServiceClient();

        // SAFETY CHECK 1: Does user already own a workspace?
        const { data: existingOwnership } = await adminClient
          .from('cohost_workspace_members')
          .select('workspace_id')
          .eq('user_id', userId)
          .eq('role', 'owner')
          .limit(1)
          .maybeSingle();

        if (!existingOwnership) {
          // User doesn't own a workspace yet — create one

          // SAFETY CHECK 2: Double-check no workspace with this creator exists
          const { data: existingWorkspace } = await adminClient
            .from('cohost_workspaces')
            .select('id')
            .eq('owner_id', userId)
            .limit(1)
            .maybeSingle();

          if (!existingWorkspace) {
            // Create workspace with transaction-like safety
            const workspaceName = userEmail
              ? `${userEmail.split('@')[0]}'s Properties`
              : 'My Properties';

            // Step 1: Create workspace
            const { data: newWorkspace, error: wsError } = await adminClient
              .from('cohost_workspaces')
              .insert({
                name: workspaceName,
                slug: `ws-${userId}`,
                owner_id: userId,
              })
              .select('id')
              .single();

            if (wsError || !newWorkspace) {
              console.error('[Auth Callback] Failed to create workspace:', wsError);
            } else {
              // Step 2: Add user as owner
              const { error: memberError } = await adminClient
                .from('cohost_workspace_members')
                .insert({
                  workspace_id: newWorkspace.id,
                  user_id: userId,
                  role: 'owner',
                });

              if (memberError) {
                console.error('[Auth Callback] Failed to add workspace member:', memberError);
                // Rollback: delete the orphaned workspace
                await adminClient
                  .from('cohost_workspaces')
                  .delete()
                  .eq('id', newWorkspace.id);
              } else {
                // Step 3: Create default automation settings
                const { error: settingsError } = await adminClient
                  .from('cohost_automation_settings')
                  .insert({
                    workspace_id: newWorkspace.id,
                    automation_level: 1, // Add any default settings fields here
                  });

                if (settingsError) {
                  console.error('[Auth Callback] Failed to create automation settings:', settingsError);
                }

                console.log('[Auth Callback] Created workspace for new user:', userId, newWorkspace.id);
              }
            }
          }
        }
      }

      console.log('Auth callback success (Token), redirecting to:', next);
      const target = next.startsWith('http') ? next : `${requestUrl.origin}${next}`;
      return NextResponse.redirect(target);
    } else {
      console.error('Auth Token Verify Error:', error);
      return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  console.error('Auth Callback Missing Credentials');
  return NextResponse.redirect(`${requestUrl.origin}/auth/login?error=Invalid+auth+verification+link`);
}
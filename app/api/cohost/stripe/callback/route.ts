import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';

export const dynamic = 'force-dynamic';
import { checkAccountStatus } from '@/lib/services/stripe-service';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceRoleClient = createCohostServiceClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // Get user's workspace
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.redirect(new URL('/cohost/settings?stripe=error', request.url));
    }
    
    // Get workspace Stripe account
    const { data: workspace } = await supabase
      .from('cohost_workspaces')
      .select('stripe_account_id')
      .eq('id', membership.workspace_id)
      .single();
    
    if (!workspace?.stripe_account_id) {
      return NextResponse.redirect(new URL('/cohost/settings?stripe=error', request.url));
    }
    
    // Check account status directly with Stripe
    const status = await checkAccountStatus(workspace.stripe_account_id);
    
    // Update local onboarding status based on details_submitted and charges_enabled
    if (status.chargesEnabled && status.detailsSubmitted) {
      await serviceRoleClient
        .from('cohost_workspaces')
        .update({ stripe_onboarding_complete: true })
        .eq('id', membership.workspace_id);
    }
    
    return NextResponse.redirect(new URL('/cohost/settings?stripe=success', request.url));
    
  } catch (error: any) {
    console.error('Stripe callback error:', error);
    return NextResponse.redirect(new URL('/cohost/settings?stripe=error', request.url));
  }
}

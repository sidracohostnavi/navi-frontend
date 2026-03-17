import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createCohostServiceClient } from '@/lib/supabase/cohostServer';
import { createConnectedAccount, createOnboardingLink } from '@/lib/services/stripe-service';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const serviceRoleClient = createCohostServiceClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user's workspace role
    const { data: membership, error: memberError } = await supabase
      .from('cohost_workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .single();
    
    if (memberError || !membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }
    
    // Only owners and admins can connect Stripe for the workspace
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    
    // Check if workspace already has a Stripe account
    const { data: workspace, error: wsError } = await supabase
      .from('cohost_workspaces')
      .select('stripe_account_id')
      .eq('id', membership.workspace_id)
      .single();
    
    if (wsError) {
      return NextResponse.json({ error: 'Failed to fetch workspace' }, { status: 500 });
    }
    
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `${appUrl}/cohost/settings?stripe=success`;
    const refreshUrl = `${appUrl}/api/cohost/stripe/connect`;
    
    let accountId = workspace.stripe_account_id;
    
    // Create new Express connected account if none exists
    if (!accountId) {
      const account = await createConnectedAccount();
      accountId = account.id;
      
      // Save account ID to workspace (using service role to ensure update succeeds)
      const { error: updateError } = await serviceRoleClient
        .from('cohost_workspaces')
        .update({ stripe_account_id: accountId })
        .eq('id', membership.workspace_id);
      
      if (updateError) {
        return NextResponse.json({ error: 'Failed to save Stripe account' }, { status: 500 });
      }
    }
    
    // Generate the Account Links URL for Stripe Express Onboarding
    const onboardingUrl = await createOnboardingLink(accountId, returnUrl, refreshUrl);
    
    return NextResponse.json({ url: onboardingUrl });
    
  } catch (error: any) {
    console.error('Stripe Connect error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

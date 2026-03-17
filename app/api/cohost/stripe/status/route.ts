import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkAccountStatus, createDashboardLink } from '@/lib/services/stripe-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get user's workspace
    const { data: membership } = await supabase
      .from('cohost_workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();
    
    if (!membership) {
      return NextResponse.json({ connected: false });
    }
    
    // Get workspace Stripe info
    const { data: workspace } = await supabase
      .from('cohost_workspaces')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', membership.workspace_id)
      .single();
    
    if (!workspace?.stripe_account_id) {
      return NextResponse.json({ connected: false });
    }
    
    // Check current status from Stripe
    const status = await checkAccountStatus(workspace.stripe_account_id);
    
    // Update local status if changed
    if (status.chargesEnabled !== workspace.stripe_onboarding_complete) {
      await supabase
        .from('cohost_workspaces')
        .update({ stripe_onboarding_complete: status.chargesEnabled })
        .eq('id', membership.workspace_id);
    }
    
    // Get Express dashboard link if fully connected and charges enabled
    let dashboardUrl = null;
    if (status.chargesEnabled) {
      dashboardUrl = await createDashboardLink(workspace.stripe_account_id);
    }
    
    return NextResponse.json({
      connected: true,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
      dashboardUrl,
    });
    
  } catch (error: any) {
    console.error('Stripe status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

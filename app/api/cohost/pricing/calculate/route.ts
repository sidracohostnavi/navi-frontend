import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { calculatePrice } from '@/lib/services/pricing-service';

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = await request.json();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { data: membership } = await supabase
    .from('cohost_workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .single();
    
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

  try {
    const breakdown = await calculatePrice({
      propertyId: body.propertyId,
      checkIn: new Date(body.checkIn),
      checkOut: new Date(body.checkOut),
      guestCount: body.guestCount || 1,
      workspaceId: membership.workspace_id,
    }, supabase);

    return NextResponse.json(breakdown);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

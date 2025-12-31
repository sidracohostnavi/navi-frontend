// app/orakl/page.tsx
import { redirect } from 'next/navigation';
import { createOraklServerClient } from '@/lib/supabaseOraklServer';
import OraklDashboard from '@/app/orakl/OraklDashboard';

export default async function OraklPage() {
  const supabase = await createOraklServerClient();
  
  const { data: { user }, error } = await supabase.auth.getUser();

  // If not logged in, redirect to login
  if (error || !user) {
    redirect('/orakl/login');
  }

  // User is authenticated, render the dashboard
  return <OraklDashboard user={user} />;
}
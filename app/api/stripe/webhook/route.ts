// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// ============================================
// HELPER: Get plan from price ID
// ============================================
function getPlanFromPriceId(priceId: string): string {
  const plusPriceId = process.env.STRIPE_PLUS_PRICE_ID;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  
  if (priceId === proPriceId) return 'pro';
  if (priceId === plusPriceId) return 'plus';
  return 'free';
}

// ============================================
// MAIN WEBHOOK HANDLER
// ============================================
export async function POST(request: NextRequest) {
  try {
    // ---- 1. VALIDATE ENVIRONMENT ----
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL;
    const supabaseServiceKey = process.env.ORAKL_SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey || !webhookSecret) {
      console.error('Stripe not configured');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase not configured');
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // ---- 2. VERIFY STRIPE SIGNATURE ----
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // ---- 3. HANDLE EVENTS ----
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        
        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionResponse = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          
          // Cast to any to access properties that TypeScript doesn't recognize
          const sub = subscriptionResponse as unknown as {
            id: string;
            items: { data: Array<{ price: { id: string } }> };
            current_period_start: number;
            current_period_end: number;
            cancel_at_period_end: boolean;
            status: string;
          };
          
          const priceId = sub.items.data[0]?.price.id || '';
          const plan = getPlanFromPriceId(priceId);
          const customerId = session.customer as string;
          const customerEmail = session.customer_email;

          if (customerEmail) {
            const { data: authData } = await supabase.auth.admin.listUsers();
            const user = authData?.users?.find(u => u.email === customerEmail);
            
            if (user) {
              const periodStart = new Date(sub.current_period_start * 1000).toISOString();
              const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

              await supabase
                .from('subscriptions')
                .upsert({
                  user_id: user.id,
                  stripe_customer_id: customerId,
                  stripe_subscription_id: sub.id,
                  status: plan,
                  plan: plan,
                  current_period_start: periodStart,
                  current_period_end: periodEnd,
                }, {
                  onConflict: 'user_id',
                });

              await supabase.rpc('update_usage_cap_for_plan', {
                p_user_id: user.id,
                p_plan: plan,
              });

              console.log(`Checkout completed for ${customerEmail}: plan=${plan}`);
            }
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscriptionEvent = event.data.object;
        
        // Cast to access properties
        const sub = subscriptionEvent as unknown as {
          id: string;
          customer: string;
          items: { data: Array<{ price: { id: string } }> };
          current_period_start: number;
          current_period_end: number;
          cancel_at_period_end: boolean;
          status: string;
        };
        
        const customerId = sub.customer;
        const priceId = sub.items.data[0]?.price.id || '';
        const plan = getPlanFromPriceId(priceId);

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (subRecord?.user_id) {
          const periodStart = new Date(sub.current_period_start * 1000).toISOString();
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

          let dbStatus: string = plan;
          let dbPlan: string = plan;
          
          if (sub.status === 'past_due') {
            dbStatus = 'past_due';
          } else if (sub.status === 'canceled') {
            dbStatus = 'cancelled';
            dbPlan = 'free';
          }

          await supabase
            .from('subscriptions')
            .update({
              status: dbStatus,
              plan: dbPlan,
              stripe_subscription_id: sub.id,
              current_period_start: periodStart,
              current_period_end: periodEnd,
              cancel_at_period_end: sub.cancel_at_period_end,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', subRecord.user_id);

          await supabase.rpc('update_usage_cap_for_plan', {
            p_user_id: subRecord.user_id,
            p_plan: dbPlan,
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscriptionEvent = event.data.object;
        const sub = subscriptionEvent as unknown as { customer: string };
        const customerId = sub.customer;

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (subRecord?.user_id) {
          await supabase
            .from('subscriptions')
            .update({
              status: 'cancelled',
              plan: 'free',
              cancel_at_period_end: false,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', subRecord.user_id);

          await supabase.rpc('update_usage_cap_for_plan', {
            p_user_id: subRecord.user_id,
            p_plan: 'free',
          });
        }
        
        console.log(`Subscription cancelled for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as { customer: string };
        const customerId = invoice.customer;

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', customerId);
        
        console.log(`Payment failed for customer: ${customerId}`);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as { customer: string };
        const customerId = invoice.customer;

        const { data: subRecord } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('stripe_customer_id', customerId)
          .single();

        if (subRecord) {
          await supabase
            .from('subscriptions')
            .update({
              status: subRecord.plan,
              updated_at: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}
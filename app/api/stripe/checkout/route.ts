// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  try {
    // ---- 1. VALIDATE ENVIRONMENT ----
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.naviverse.ai';
    const supabaseUrl = process.env.NEXT_PUBLIC_ORAKL_SUPABASE_URL;
    const supabaseServiceKey = process.env.ORAKL_SUPABASE_SERVICE_ROLE_KEY;

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: 'Stripe is not configured' },
        { status: 500 }
      );
    }

    // ---- 2. PARSE REQUEST ----
    const body = await request.json();
    const { plan, authToken } = body as { plan: 'plus' | 'pro'; authToken: string };

    if (!plan || !['plus', 'pro'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan specified' },
        { status: 400 }
      );
    }

    if (!authToken) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // ---- 3. VERIFY AUTH ----
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { data: { user }, error: authError } = await supabase.auth.getUser(authToken);
      
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Invalid authentication' },
          { status: 401 }
        );
      }
    }

    // ---- 4. GET PRICE ID ----
    const priceIds: Record<string, string | undefined> = {
      plus: process.env.STRIPE_PLUS_PRICE_ID,
      pro: process.env.STRIPE_PRO_PRICE_ID,
    };

    const priceId = priceIds[plan];

    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for plan: ${plan}` },
        { status: 500 }
      );
    }

    // ---- 5. CREATE CHECKOUT SESSION ----
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/orakl?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/orakl?checkout=cancelled`,
      metadata: {
        plan,
      },
      subscription_data: {
        metadata: {
          plan,
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });

  } catch (error: unknown) {
    console.error('Checkout error:', error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        { error: `Stripe error: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePriceId = process.env.STRIPE_PRICE_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.naviverse.ai';

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: 'Stripe is not configured. Please add STRIPE_SECRET_KEY to environment variables.' },
        { status: 500 }
      );
    }

    if (!stripePriceId) {
      return NextResponse.json(
        { error: 'Stripe Price ID is not configured. Please add STRIPE_PRICE_ID to environment variables.' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { plan } = body;

    if (plan !== 'orakl_pro') {
      return NextResponse.json(
        { error: 'Invalid plan specified.' },
        { status: 400 }
      );
    }

    // Dynamically import Stripe to avoid build issues if not installed
    const Stripe = (await import('stripe')).default;
    
    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-12-15.clover',
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/orakl?checkout=success`,
      cancel_url: `${appUrl}/orakl?checkout=cancelled`,
      metadata: {
        plan: 'orakl_pro',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error('Stripe checkout error:', error);
    
    // Type-safe error handling
    if (error && typeof error === 'object' && 'type' in error) {
      // This is likely a Stripe error
      const stripeError = error as { message?: string };
      return NextResponse.json(
        { error: `Stripe error: ${stripeError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session. Please try again.' },
      { status: 500 }
    );
  }
}
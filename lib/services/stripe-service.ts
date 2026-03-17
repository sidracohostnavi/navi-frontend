import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is missing from environment variables. Stripe features will fail.');
}

// Initialize Stripe with secret key (or empty string fallback to prevent crash)
export const stripe = new Stripe(STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
  typescript: true,
});

/**
 * Create a new Express connected account
 */
export async function createConnectedAccount(): Promise<Stripe.Account> {
  const account = await stripe.accounts.create({
    type: 'express',
  });
  return account;
}

/**
 * Create onboarding link for an existing Express account using the Account Links API
 */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return accountLink.url;
}

/**
 * Check if the Express account has completed onboarding and can receive charges/payouts
 */
export async function checkAccountStatus(accountId: string): Promise<{
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/**
 * Create a Stripe login link for connected Express account dashboard
 */
export async function createDashboardLink(accountId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(accountId);
  return loginLink.url;
}

interface PriceCalculationInput {
  propertyId: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  workspaceId: string;
}

interface PriceBreakdown {
  nights: number;
  nightlyRate: number; // cents
  roomTotal: number; // cents (nights × rate)
  extraGuestsCount: number;
  extraGuestFeePerNight: number; // cents
  extraGuestTotal: number; // cents
  subtotal: number; // cents (room + extra guests)
  fees: Array<{
    id: string;
    name: string;
    amount: number; // cents
    isTax: boolean;
  }>;
  feesTotal: number; // cents
  taxesTotal: number; // cents
  grandTotal: number; // cents
}

export async function calculatePrice(
  input: PriceCalculationInput,
  supabase: any
): Promise<PriceBreakdown> {
  // 1. Get property pricing
  const { data: property } = await supabase
    .from('cohost_properties')
    .select('base_nightly_rate, base_guests_included, extra_guest_fee, max_guests')
    .eq('id', input.propertyId)
    .single();

  if (!property || !property.base_nightly_rate) {
    throw new Error('Property pricing not configured');
  }

  // 2. Calculate nights
  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  // 3. Calculate room total
  const nightlyRate = property.base_nightly_rate;
  const roomTotal = nightlyRate * nights;

  // 4. Calculate extra guest fees
  const baseGuests = property.base_guests_included || 2;
  const extraGuestsCount = Math.max(0, input.guestCount - baseGuests);
  const extraGuestFeePerNight = property.extra_guest_fee || 0;
  const extraGuestTotal = extraGuestsCount * extraGuestFeePerNight * nights;

  // 5. Subtotal before fees
  const subtotal = roomTotal + extraGuestTotal;

  // 6. Get applicable fees
  const { data: allFees } = await supabase
    .from('workspace_fees')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('is_active', true)
    .order('display_order');

  // Filter fees that apply to this property
  const applicableFees = (allFees || []).filter((fee: any) => {
    if (!fee.applies_to_property_ids || fee.applies_to_property_ids.length === 0) {
      return true; // Applies to all
    }
    return fee.applies_to_property_ids.includes(input.propertyId);
  });

  // 7. Calculate each fee
  const fees: PriceBreakdown['fees'] = [];
  let feesTotal = 0;
  let taxesTotal = 0;

  for (const fee of applicableFees) {
    let amount = 0;
    if (fee.fee_type === 'fixed') {
      amount = fee.amount || 0;
    } else if (fee.fee_type === 'percentage') {
      amount = Math.round(subtotal * (fee.percentage / 100));
    }

    fees.push({
      id: fee.id,
      name: fee.name,
      amount,
      isTax: fee.is_tax,
    });

    if (fee.is_tax) {
      taxesTotal += amount;
    } else {
      feesTotal += amount;
    }
  }

  // 8. Grand total
  const grandTotal = subtotal + feesTotal + taxesTotal;

  return {
    nights,
    nightlyRate,
    roomTotal,
    extraGuestsCount,
    extraGuestFeePerNight,
    extraGuestTotal,
    subtotal,
    fees,
    feesTotal,
    taxesTotal,
    grandTotal,
  };
}

// Format cents to dollars string
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

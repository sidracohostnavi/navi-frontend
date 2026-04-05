interface PriceCalculationInput {
  propertyId: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  workspaceId: string;
}

interface NightlyBreakdown {
  date: string;
  rate: number; // cents
  isOverride: boolean;
}

interface PriceBreakdown {
  nights: number;
  nightlyBreakdown: NightlyBreakdown[];
  baseNightlyRate: number; // cents (property default)
  roomTotal: number; // cents
  extraGuestsCount: number;
  extraGuestFeePerNight: number; // cents
  extraGuestTotal: number; // cents
  subtotal: number; // cents
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
  const { data: property, error: propError } = await supabase
    .from('cohost_properties')
    .select('base_nightly_rate, base_guests_included, extra_guest_fee, max_guests')
    .eq('id', input.propertyId)
    .single();

  if (propError || !property || property.base_nightly_rate === null) {
    console.error('Property pricing error:', propError);
    throw new Error('Property pricing not configured');
  }

  const baseNightlyRate = (property.base_nightly_rate || 0) * 100; // Convert dollars to cents
  const extraGuestFeePerNight = (property.extra_guest_fee || 0) * 100; // Convert dollars to cents

  // 2. Calculate nights and generate date list
  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

  const dateList: string[] = [];
  const current = new Date(checkIn);
  while (current < checkOut) {
    dateList.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  // 3. Fetch date-specific pricing overrides
  const { data: dateOverrides } = await supabase
    .from('property_date_pricing')
    .select('date, nightly_rate')
    .eq('property_id', input.propertyId)
    .in('date', dateList);

  // Create lookup map
  const overrideMap = new Map<string, number>();
  (dateOverrides || []).forEach((o: any) => {
    overrideMap.set(o.date, o.nightly_rate);
  });

  // 4. Calculate nightly breakdown
  const nightlyBreakdown: NightlyBreakdown[] = dateList.map(date => {
    const override = overrideMap.get(date);
    return {
      date,
      rate: override !== undefined ? override : baseNightlyRate,
      isOverride: override !== undefined,
    };
  });

  // 5. Calculate room total
  const roomTotal = nightlyBreakdown.reduce((sum, n) => sum + n.rate, 0);

  // 6. Calculate extra guest fees
  const baseGuests = property.base_guests_included || 2;
  const extraGuestsCount = Math.max(0, input.guestCount - baseGuests);
  // extraGuestFeePerNight was already normalized to cents above
  const extraGuestTotal = extraGuestsCount * extraGuestFeePerNight * nights;

  // 7. Subtotal before fees
  const subtotal = roomTotal + extraGuestTotal;

  // 8. Get applicable fees
  const { data: allFees } = await supabase
    .from('workspace_fees')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('is_active', true)
    .order('display_order');

  // Filter fees that apply to this property
  const applicableFees = (allFees || []).filter((fee: any) => {
    if (!fee.applies_to_property_ids || fee.applies_to_property_ids.length === 0) {
      return true;
    }
    return fee.applies_to_property_ids.includes(input.propertyId);
  });

  // 9. Calculate each fee
  const fees: PriceBreakdown['fees'] = [];
  let feesTotal = 0;
  let taxesTotal = 0;

  for (const fee of applicableFees) {
    let amount = 0;
    if (fee.fee_type === 'fixed') {
      amount = (fee.amount || 0) * 100;
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

  // 10. Grand total
  const grandTotal = subtotal + feesTotal + taxesTotal;

  return {
    nights,
    nightlyBreakdown,
    baseNightlyRate,
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

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

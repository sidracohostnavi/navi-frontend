import { Resend } from 'resend';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey && process.env.NODE_ENV === 'production') {
    console.warn('RESEND_API_KEY is missing');
  }
  return new Resend(apiKey || 'unspecified');
}

interface SendQuoteEmailParams {
  to: string;
  guestFirstName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number; // cents
  paymentLink: string;
  expiresAt: string;
  hostName?: string;
  cancellationPolicy?: string;
  rentalAgreement?: string;
}

export async function sendQuoteEmail(params: SendQuoteEmailParams): Promise<boolean> {
  const {
    to,
    guestFirstName,
    propertyName,
    checkIn,
    checkOut,
    totalPrice,
    paymentLink,
    expiresAt,
    hostName,
    cancellationPolicy,
    rentalAgreement,
  } = params;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  try {
    const { data, error } = await getResend().emails.send({
      from: 'Navi CoHost <bookings@cohostnavi.com>',
      to,
      subject: `Your Booking Quote for ${propertyName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; }
            .card { background: #f9fafb; border-radius: 12px; padding: 24px; margin: 20px 0; border: 1px solid #e5e7eb; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: 600; }
            .total { font-size: 24px; color: #111; margin: 20px 0; text-align: center; font-weight: bold; }
            .button { display: inline-block; background: #14b8a6; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 20px 0; }
            .button-container { text-align: center; }
            .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px; }
            .expiry { background: #fffbeb; color: #92400e; padding: 12px; border-radius: 8px; text-align: center; margin: 20px 0; font-size: 14px; border: 1px solid #fef3c7; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #14b8a6; margin: 0; font-size: 28px;">Your Booking Quote</h1>
            </div>
            
            <p>Hi ${guestFirstName},</p>
            
            <p>Great news! Your booking request has been received. Here are the details:</p>
            
            <div class="card">
              <h2 style="margin-top: 0; color: #111;">${propertyName}</h2>
              
              <div class="detail-row">
                <span class="label">Check-in</span>
                <span class="value">${formatDate(checkIn)}</span>
              </div>
              
              <div class="detail-row">
                <span class="label">Check-out</span>
                <span class="value">${formatDate(checkOut)}</span>
              </div>
            </div>
            
            <div class="total">
              Total: ${formatPrice(totalPrice)}
            </div>

            ${cancellationPolicy || rentalAgreement ? `
              <div style="margin: 30px 0; padding: 20px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Important Information</h3>
                
                ${cancellationPolicy ? `
                  <div style="margin-bottom: 15px;">
                    <strong style="color: #4b5563; font-size: 14px;">Cancellation Policy:</strong>
                    <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">${cancellationPolicy}</p>
                  </div>
                ` : ''}
                
                ${rentalAgreement ? `
                  <div>
                    <strong style="color: #4b5563; font-size: 14px;">Rental Agreement:</strong>
                    <p style="margin: 5px 0; color: #6b7280; white-space: pre-wrap; font-size: 13px; font-family: monospace;">${
                      rentalAgreement.length > 800 
                        ? rentalAgreement.substring(0, 800) + '...\n\n[Full agreement available on checkout page]'
                        : rentalAgreement
                    }</p>
                  </div>
                ` : ''}
              </div>
              
              <p style="color: #92400e; background: #fef3c7; padding: 12px; border-radius: 6px; text-align: center; font-size: 13px; font-weight: bold;">
                ⚠️ You will be asked to confirm you have read and agree to these terms before completing your booking.
              </p>
            ` : ''}
            
            <div class="button-container">
              <a href="${paymentLink}" class="button">Complete Your Booking</a>
            </div>
            
            <div class="expiry">
              ⏰ This quote expires on ${formatDate(expiresAt)}
            </div>
            
            <p>Click the button above to complete your payment and confirm your reservation.</p>
            
            <p>If you have any questions, please don't hesitate to reach out.</p>
            
            <p>Looking forward to hosting you!</p>
            
            ${hostName ? `<p>— ${hostName}</p>` : ''}
            
            <div class="footer">
              <p>This email was sent via Navi CoHost</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return false;
    }

    console.log('[Email] Quote email sent successfully:', data?.id);
    return true;
  } catch (e) {
    console.error('[Email] Failed to send quote email:', e);
    return false;
  }
}

export async function sendGuestConfirmationEmail(params: {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  nights: number;
}): Promise<boolean> {
  const { guestName, guestEmail, propertyName, checkIn, checkOut, totalPrice, nights } = params;
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  try {
    const { error } = await getResend().emails.send({
      from: 'Navi CoHost <bookings@cohostnavi.com>',
      to: guestEmail,
      subject: `Booking Confirmed: ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6;">Booking Confirmed!</h1>
          <p>Hi ${guestName},</p>
          <p>Your stay at <strong>${propertyName}</strong> is confirmed.</p>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Total Paid:</strong> ${formatPrice(totalPrice)}</p>
          </div>
          <p>We're looking forward to having you!</p>
        </div>
      `,
    });
    return !error;
  } catch (e) {
    console.error('[Email] Failed to send guest confirmation:', e);
    return false;
  }
}

export async function sendHostNotificationEmail(params: {
  hostEmail: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  nights: number;
}): Promise<boolean> {
  const { hostEmail, guestName, guestEmail, guestPhone, propertyName, checkIn, checkOut, totalPrice, nights } = params;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  try {
    const { error } = await getResend().emails.send({
      from: 'Navi CoHost <bookings@cohostnavi.com>',
      to: hostEmail,
      subject: `New Booking: ${guestName} at ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6;">New Direct Booking!</h1>
          <p>You have a new booking for <strong>${propertyName}</strong>.</p>
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Guest:</strong> ${guestName}</p>
            <p><strong>Email:</strong> ${guestEmail}</p>
            ${guestPhone ? `<p><strong>Phone:</strong> ${guestPhone}</p>` : ''}
            <p><strong>Dates:</strong> ${formatDate(checkIn)} - ${formatDate(checkOut)} (${nights} nights)</p>
            <p><strong>Payout:</strong> ${formatPrice(totalPrice)}</p>
          </div>
          <p>The calendar has been updated accordingly.</p>
        </div>
      `,
    });
    return !error;
  } catch (e) {
    console.error('[Email] Failed to send host notification:', e);
    return false;
  }
}

export async function sendPaymentLinkEmail(params: {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  nights: number;
  paymentUrl: string;
}): Promise<boolean> {
  const { guestName, guestEmail, propertyName, checkIn, checkOut, totalPrice, nights, paymentUrl } = params;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  try {
    const { error } = await getResend().emails.send({
      from: 'Navi CoHost <bookings@cohostnavi.com>',
      to: guestEmail,
      subject: `Payment Link for your stay at ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #14b8a6;">Complete Your Booking</h1>
          <p>Hi ${guestName},</p>
          <p>Please click the link below to complete your payment for <strong>${propertyName}</strong>.</p>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Total Due:</strong> ${formatPrice(totalPrice)}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${paymentUrl}" style="background: #14b8a6; color: white; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              Pay & Confirm Reservation
            </a>
          </div>

          <p>If you have any questions, please reply to this email.</p>
          <p>Best regards,<br/>Navi CoHost Team</p>
        </div>
      `,
    });
    return !error;
  } catch (e) {
    console.error('[Email] Failed to send payment link:', e);
    return false;
  }
}

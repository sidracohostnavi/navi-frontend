import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || 'Navi CoHost <bookings@cohostnavi.com>';

interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  nights: number;
}

interface HostEmailData extends BookingEmailData {
  hostEmail: string;
  guestPhone?: string;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC' // Explicit UTC for check-in/out dates
    });
  } catch (e) {
    return dateStr;
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD' 
  }).format(cents / 100);
}

/**
 * Send booking confirmation to guest
 */
export async function sendGuestConfirmationEmail(data: BookingEmailData) {
  const { guestName, guestEmail, propertyName, checkIn, checkOut, totalPrice, nights } = data;
  
  try {
    const { data: res, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: guestEmail,
      subject: `Booking Confirmed - ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Booking Confirmed!</h1>
          
          <p>Hi ${guestName},</p>
          
          <p>Your booking has been confirmed. Here are the details:</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: #1a1a1a;">${propertyName}</h2>
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Total Paid:</strong> ${formatCurrency(totalPrice)}</p>
          </div>
          
          <p>The host will be in touch with check-in instructions closer to your arrival date.</p>
          
          <p>Thank you for booking!</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="color: #666; font-size: 12px;">
            This email was sent by Navi CoHost on behalf of your host.
          </p>
        </div>
      `,
    });
    
    if (error) throw error;
    
    console.log('Guest confirmation email sent to:', guestEmail, res?.id);
    return true;
  } catch (error) {
    console.error('Failed to send guest confirmation email:', error);
    return false;
  }
}

/**
 * Send new booking notification to host
 */
export async function sendHostNotificationEmail(data: HostEmailData) {
  const { 
    hostEmail, 
    guestName, 
    guestEmail, 
    guestPhone, 
    propertyName, 
    checkIn, 
    checkOut, 
    totalPrice, 
    nights 
  } = data;
  
  try {
    const { data: res, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: hostEmail,
      subject: `New Booking - ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">New Direct Booking!</h1>
          
          <p>You have a new booking for <strong>${propertyName}</strong>.</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Guest Details</h3>
            <p><strong>Name:</strong> ${guestName}</p>
            <p><strong>Email:</strong> ${guestEmail}</p>
            ${guestPhone ? `<p><strong>Phone:</strong> ${guestPhone}</p>` : ''}
            
            <h3>Stay Details</h3>
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Total:</strong> ${formatCurrency(totalPrice)}</p>
          </div>
          
          <p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/cohost/calendar" 
               style="display: inline-block; background: #FA5A5A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View in Navi
            </a>
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="color: #666; font-size: 12px;">
            This booking was made through your Navi CoHost direct booking page.
          </p>
        </div>
      `,
    });
    
    if (error) throw error;
    
    console.log('Host notification email sent to:', hostEmail, res?.id);
    return true;
  } catch (error) {
    console.error('Failed to send host notification email:', error);
    return false;
  }
}

/**
 * Send payment link to guest
 */
export async function sendPaymentLinkEmail(data: {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  totalPrice: number;
  nights: number;
  paymentUrl: string;
}) {
  const { 
    guestName, 
    guestEmail, 
    propertyName, 
    checkIn, 
    checkOut, 
    totalPrice, 
    nights,
    paymentUrl,
  } = data;
  
  try {
    const { data: res, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: guestEmail,
      subject: `Complete Your Booking - ${propertyName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1a1a1a;">Complete Your Booking</h1>
          
          <p>Hi ${guestName},</p>
          
          <p>Your host has created a booking for you. Please complete payment to confirm:</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: #1a1a1a;">${propertyName}</h2>
            <p><strong>Check-in:</strong> ${formatDate(checkIn)}</p>
            <p><strong>Check-out:</strong> ${formatDate(checkOut)}</p>
            <p><strong>Nights:</strong> ${nights}</p>
            <p><strong>Total:</strong> ${formatCurrency(totalPrice)}</p>
          </div>
          
          <p>
            <a href="${paymentUrl}" 
               style="display: inline-block; background: #FA5A5A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              Complete Payment
            </a>
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            Or copy this link: ${paymentUrl}
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="color: #666; font-size: 12px;">
            This email was sent by Navi CoHost on behalf of your host.
          </p>
        </div>
      `,
    });
    
    if (error) throw error;
    
    console.log('Payment link email sent to:', guestEmail, res?.id);
    return true;
  } catch (error) {
    console.error('Failed to send payment link email:', error);
    return false;
  }
}

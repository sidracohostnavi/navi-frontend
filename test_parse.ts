import { EmailProcessor } from "./lib/services/email-processor";

const bodyText = `From: Nora Weber <renter-10fd28a9-8013-4019-b0eb-86409b3793b4@messaging.lodgify.com>
Date: Wed, Jan 21, 2026 at 4:36 PM
Subject: Question about Booking Confirmation - #B16389402
To: Sidra Vaines <sidravaines@gmail.com>

BOOKING (#B16389402)
Status: Booked
Arrival: Mar 12 2026
Departure: Mar 15 2026
Nights: 3
Property: Tiny Cottage 1 Bed Ensuite Bath Sunrise Ocean View
Guests: 2 guest(s)
--------------------------------------------
QUOTE (#14762230)
Status: Agreed
PRICE
Tiny Cottage 1 Bed Ensuite Bath Sunrise Ocean View    USD 389.00
Payment Processing Fee    USD 15.56
Cleaning Fee    USD 85.00
Transient Occupancy Tax    USD 70.99
Total booking amount: USD 560.55
Payment Schedule
Due on Oct 01 2025    USD 560.55    Paid
Cancellation Policy
Prepayments made are non-refundable.

Security deposit
Pre-authorize guest’s card for USD 150.00 from Mar 11 2026.
Release remaining pre-authorizations on Mar 17 2026.

Transactions
No transactions yet. Rental Agreement (
https://checkout.lodgify.com/hamakuasunrise/en#/rentalAgreement/a42afa36-7ed6-59df-c465-a9db37f988cb/76cc694f-97b1-4b66-8958-80f55605e855)

--------------------------------------------
Guest details
Name:  Nora Weber
Phone: +17074808269
Email: noralweber@gmail.com
Country: United States

Kind regards,
Your Lodgify Team

Lodgify is a brand of Codebay Solutions Ltd., Magma House, 16 Davy Court
Way, Castle Mound Way, Rugby, Warwickshire, CV23 0UZ, United Kingdom
`;

const subject = "Booking Confirmation - #B16389402";

const fact = EmailProcessor.parseReservationEmail(bodyText, subject, true, {});
console.log("Parsed fact:", JSON.stringify(fact, null, 2));

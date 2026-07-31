/**
 * Razorpay gateway integration (P2-MOD-08). Kept thin: order creation and
 * webhook signature verification. When credentials are unset the API runs in
 * "manual" mode — orders get a local placeholder id and no network call is made,
 * so the fee flow works end-to-end in dev without a Razorpay account.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../env.js';

const ORDERS_URL = 'https://api.razorpay.com/v1/orders';

export function razorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export function webhookConfigured(): boolean {
  return Boolean(env.RAZORPAY_WEBHOOK_SECRET);
}

/**
 * Create a gateway order and return its provider order id. In manual mode
 * (no keys) this is a local `order_local_<uuid>` placeholder.
 */
export async function createRazorpayOrder(params: {
  amount: number; // minor units
  currency: string;
  notes: Record<string, string>;
}): Promise<string> {
  if (!razorpayConfigured()) return `order_local_${randomUUID()}`;

  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      notes: params.notes,
    }),
  });
  if (!res.ok) {
    throw new Error(`Razorpay order creation failed (${res.status})`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

/**
 * Verify a Razorpay webhook signature: HMAC-SHA256 of the raw request body,
 * keyed by the webhook secret, compared constant-time against the header.
 */
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
  if (!webhookConfigured() || !signature) return false;
  const expected = createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Payment-gateway webhooks (P2-MOD-08). Public (no tenant/auth) — authenticated
 * by HMAC signature instead. Runs in an encapsulated scope with a raw-body
 * parser so the exact bytes are available for signature verification.
 *
 * Trust model: the webhook body is signed by Razorpay with our webhook secret,
 * so once the signature verifies we trust its contents — including the
 * `notes.tenantId` we set at order creation, which tells us whose ledger to
 * settle. Cross-tenant writes go through withTenant() (not request.tenantDb,
 * which needs a resolved tenant this public route doesn't have).
 */
import { auditLogs, emitEvent, feePaymentOrders, withTenant } from '@schoolmate/db';
import { EVENT_TYPES } from '@schoolmate/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { applyPaymentFifo } from '../lib/fee-collection.js';
import { verifyWebhookSignature, webhookConfigured } from '../lib/razorpay.js';

interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        notes?: Record<string, string>;
      };
    };
  };
}

export async function webhookRoutes(app: FastifyInstance) {
  await app.register(async (scope) => {
    // Raw-body parser, scoped to this plugin only, so HMAC sees exact bytes.
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
      try {
        const parsed = body.length ? JSON.parse(body.toString('utf8')) : {};
        (_req as FastifyRequest & { rawBody?: Buffer }).rawBody = body as Buffer;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    });

    scope.post(
      '/webhooks/razorpay',
      { config: { tenant: false, permission: false } },
      async (request, reply) => {
        if (!webhookConfigured()) {
          return reply
            .status(503)
            .send({
              success: false,
              error: { code: 'GATEWAY_DISABLED', message: 'Webhook secret not configured' },
            });
        }

        const rawBody =
          (request as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
        const signature = request.headers['x-razorpay-signature'];
        if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
          return reply
            .status(401)
            .send({
              success: false,
              error: { code: 'INVALID_SIGNATURE', message: 'Bad webhook signature' },
            });
        }

        const body = request.body as RazorpayEvent;
        // We only settle on a captured payment; ack everything else.
        if (body.event !== 'payment.captured') {
          return reply.send({
            success: true,
            data: { received: true, ignored: body.event ?? null },
          });
        }

        const entity = body.payload?.payment?.entity;
        const tenantId = entity?.notes?.tenantId;
        const orderId = entity?.order_id;
        const paymentRef = entity?.id;
        if (!tenantId || !orderId) {
          return reply.send({
            success: true,
            data: { received: true, ignored: 'missing_notes_or_order' },
          });
        }

        const outcome = await withTenant(app.pgApp, tenantId, async (db) => {
          const [order] = await db
            .select()
            .from(feePaymentOrders)
            .where(
              and(
                eq(feePaymentOrders.tenantId, tenantId),
                eq(feePaymentOrders.providerOrderId, orderId),
              ),
            )
            .limit(1);
          if (!order) return { status: 'unknown_order' as const };

          // Idempotency: flip created→paid atomically; a duplicate delivery
          // updates 0 rows and we skip re-settling.
          const flipped = await db
            .update(feePaymentOrders)
            .set({
              status: 'paid',
              providerPaymentId: paymentRef ?? null,
              updatedAt: new Date(),
            })
            .where(and(eq(feePaymentOrders.id, order.id), eq(feePaymentOrders.status, 'created')))
            .returning({ id: feePaymentOrders.id });
          if (flipped.length === 0) return { status: 'already_processed' as const };

          const res = await applyPaymentFifo(db, {
            tenantId,
            studentId: order.studentId,
            amount: order.amount,
            method: 'online',
            reference: paymentRef ?? null,
          });
          await db
            .update(feePaymentOrders)
            .set({ paymentId: res.payment.id, updatedAt: new Date() })
            .where(eq(feePaymentOrders.id, order.id));

          // System actor (no user) — insert the audit row directly.
          await db.insert(auditLogs).values({
            tenantId,
            userId: null,
            userRole: 'system',
            action: 'create',
            entityType: 'fee_payment',
            entityId: res.payment.id,
            newValues: {
              amount: order.amount,
              receiptNumber: res.payment.receiptNumber,
              gateway: 'razorpay',
              orderId,
            } as never,
          });
          await emitEvent(db, {
            tenantId,
            type: EVENT_TYPES.FEE_PAYMENT_RECEIVED,
            aggregateType: 'fee_payment',
            aggregateId: res.payment.id,
            payload: {
              studentId: order.studentId,
              amount: order.amount,
              receiptNumber: res.payment.receiptNumber,
              gateway: 'razorpay',
            },
          });
          return { status: 'settled' as const, receiptNumber: res.payment.receiptNumber };
        });

        return reply.send({ success: true, data: { received: true, ...outcome } });
      },
    );
  });
}

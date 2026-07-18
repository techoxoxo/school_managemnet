/**
 * Background job processor (Plan §2). Queue consumers (Bull) register here
 * from Phase 1 (P1-API-01 outbox poller onward).
 */
console.log('[worker] started — no queues registered yet');

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

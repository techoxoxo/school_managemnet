import { createDb, createPool } from '@schoolmate/db';
import { env } from './env.js';
import { defaultSenders } from './notifications/channels.js';
import { registerAllHandlers } from './notifications/handlers.js';
import { drainOutbox, processQueue } from './relay.js';

/**
 * Background worker (Plan §2/§17): polls the transactional outbox, dispatches
 * domain events to notification handlers, and delivers queued messages.
 * Connects with the admin (BYPASSRLS) role to span all tenants.
 */
const pool = createPool(env.DATABASE_URL);
const db = createDb(pool);
const senders = defaultSenders();

registerAllHandlers();

let running = true;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const published = await drainOutbox(db);
    const sent = await processQueue(db, senders);
    if (published || sent) {
      console.log(`[worker] published=${published} delivered=${sent}`);
    }
  } catch (err) {
    console.error('[worker] tick error', err);
  } finally {
    ticking = false;
  }
}

const interval = setInterval(() => void tick(), env.RELAY_INTERVAL_MS);
console.log(`[worker] started — polling every ${env.RELAY_INTERVAL_MS}ms`);

async function shutdown(signal: string) {
  if (!running) return;
  running = false;
  console.log(`[worker] ${signal} — shutting down`);
  clearInterval(interval);
  await pool.end().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

import type { Channel } from '@schoolmate/shared';
import nodemailer from 'nodemailer';
import { env } from '../env.js';

export interface OutboundMessage {
  recipient: string;
  subject?: string | null;
  body: string;
}

/** A pluggable delivery channel. Providers are swapped per environment. */
export interface ChannelSender {
  send(msg: OutboundMessage): Promise<void>;
}

/** Email via SMTP (mailpit in dev, SES/SendGrid in prod). */
class EmailSender implements ChannelSender {
  private transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  async send(msg: OutboundMessage): Promise<void> {
    await this.transport.sendMail({
      from: env.MAIL_FROM,
      to: msg.recipient,
      subject: msg.subject ?? 'Notification',
      text: msg.body,
    });
  }
}

/**
 * Dev SMS provider — logs instead of sending. Production swaps in
 * MSG91/Twilio behind this same interface (Plan Appendix B). Multi-provider
 * failover lands with the billing/credits work (Plan §25 risk #5).
 */
class LogSmsSender implements ChannelSender {
  async send(msg: OutboundMessage): Promise<void> {
    console.log(`[sms→${msg.recipient}] ${msg.body}`);
  }
}

class LogPushSender implements ChannelSender {
  async send(msg: OutboundMessage): Promise<void> {
    console.log(`[push→${msg.recipient}] ${msg.subject ?? ''} ${msg.body}`);
  }
}

/** Channel → sender registry. `in_app` is written to the DB, not sent here. */
export type SenderRegistry = Partial<Record<Channel, ChannelSender>>;

export function defaultSenders(): SenderRegistry {
  return {
    email: new EmailSender(),
    sms: new LogSmsSender(),
    push: new LogPushSender(),
    whatsapp: new LogSmsSender(),
  };
}

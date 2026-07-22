import { EVENT_TYPES } from '@schoolmate/shared';
import { registerHandler, type NotifyIntent } from './dispatch.js';

/**
 * Notification handlers per event type (Plan §17). Each maps a domain event to
 * the notifications it should produce. Emitting modules populate the payload
 * shapes referenced here; new modules add handlers without touching the relay.
 */
export function registerAllHandlers(): void {
  // attendance.absent → tell each parent, in-app + SMS (P1-API-03 / P1-MOD-23).
  registerHandler(EVENT_TYPES.ATTENDANCE_ABSENT, (event) => {
    const p = event.payload as {
      studentName?: string;
      date?: string;
      recipients?: Array<{ userId?: string; phone?: string }>;
    };
    const when = p.date ?? 'today';
    const name = p.studentName ?? 'Your child';
    const body = `${name} was marked absent on ${when}. Please contact the school if this is unexpected.`;
    return (p.recipients ?? []).map<NotifyIntent>((rcpt) => ({
      userId: rcpt.userId,
      recipient: rcpt.phone,
      channels: rcpt.phone ? ['in_app', 'sms'] : ['in_app'],
      title: 'Absence notice',
      body,
    }));
  });

  // exam.results.published → notify parents/students results are out.
  registerHandler(EVENT_TYPES.EXAM_RESULTS_PUBLISHED, (event) => {
    const p = event.payload as {
      examName?: string;
      recipients?: Array<{ userId?: string }>;
    };
    return (p.recipients ?? []).map<NotifyIntent>((rcpt) => ({
      userId: rcpt.userId,
      channels: ['in_app'],
      title: 'Results published',
      body: `Results for ${p.examName ?? 'the recent exam'} are now available.`,
    }));
  });

  // announcement.published → fan out to targeted users.
  registerHandler(EVENT_TYPES.ANNOUNCEMENT_PUBLISHED, (event) => {
    const p = event.payload as {
      title?: string;
      recipients?: Array<{ userId?: string }>;
    };
    return (p.recipients ?? []).map<NotifyIntent>((rcpt) => ({
      userId: rcpt.userId,
      channels: ['in_app'],
      title: p.title ?? 'New announcement',
      body: p.title ?? 'A new announcement was posted.',
    }));
  });
}

/**
 * Domain event catalog (Plan §17). Modules emit these via emitEvent() inside
 * their DB transaction (transactional outbox); the worker relays them to
 * consumers (notifications, webhooks, analytics). Adding an event = add a
 * constant here + a payload type + (optionally) a notification handler.
 */
export const EVENT_TYPES = {
  STUDENT_ADMITTED: 'student.admitted',
  STUDENT_PROMOTED: 'student.promoted',
  STUDENT_TRANSFERRED: 'student.transferred',
  STAFF_ACCOUNT_CREATED: 'staff.account_created',
  ATTENDANCE_ABSENT: 'attendance.absent',
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_UNMARKED_REMINDER: 'attendance.unmarked_reminder',
  FEE_PAYMENT_RECEIVED: 'fee.payment.received',
  FEE_PAYMENT_OVERDUE: 'fee.payment.overdue',
  EXAM_RESULTS_PUBLISHED: 'exam.results.published',
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

/** Notification delivery channels (Plan §4.O). */
export const CHANNELS = {
  IN_APP: 'in_app',
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  WHATSAPP: 'whatsapp',
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

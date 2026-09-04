// Pluggable push delivery — same seam shape as AI_VISION_PROVIDER and
// OTP_PROVIDER. Unlike those two, there's no ready-made default beyond
// "no external provider" (see NoopPushProvider): push delivery needs a
// Firebase project (or another gateway) created under the client's own
// account — that's the actual answer to "why isn't this wired yet", not
// a decision to skip it. The in-app Notification row NotificationsService
// already writes is unaffected either way — this only controls whether a
// device also gets woken up for it.

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

export interface PushProvider {
  send(deviceToken: string, title: string, body: string, data?: Record<string, string>): Promise<void>;
}

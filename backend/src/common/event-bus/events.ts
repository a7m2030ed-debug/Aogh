// Names of the domain events modules publish/subscribe to on the event bus.
// Keeping them here (instead of string literals scattered across modules)
// is what lets a new subscriber plug into an existing event without the
// publishing module knowing or caring who's listening.

export const DomainEvents = {
  // A customer posted what they need — every verified dealer gets told
  // (modules/notifications subscribes).
  PART_REQUEST_CREATED: 'part_request.created',
  // A dealer answered a request, which opened a conversation — the
  // customer gets told.
  REQUEST_ANSWERED: 'request.answered',
  // Either side sent a chat message.
  MESSAGE_SENT: 'message.sent',
} as const;

// Names of the domain events modules publish/subscribe to on the event bus.
// Keeping them here (instead of string literals scattered across modules)
// is what lets a new subscriber (e.g. search-index update, admin report,
// customer notification) plug into an existing event without the
// publishing module knowing or caring who's listening.

export const DomainEvents = {
  LISTING_CREATED: 'listing.created',
  LISTING_SOLD: 'listing.sold',
  LISTING_AVAILABILITY_CHANGED: 'listing.availability_changed',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  NEGOTIATION_AGREED: 'negotiation.agreed',
  SEARCH_REQUEST_CREATED: 'search_request.created',
  SEARCH_REQUEST_OFFER_SUBMITTED: 'search_request.offer_submitted',
  REVIEW_SUBMITTED: 'review.submitted',
} as const;

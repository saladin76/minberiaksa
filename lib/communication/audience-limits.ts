/**
 * One ceiling for a hand-picked audience, shared by every layer that touches it.
 *
 * It used to be two: the donor picker let a user "select all" up to 5,000
 * matches, and the route that turns that selection into an audience list
 * rejected anything over 1,000. The wizard therefore offered a selection it
 * could not save  the request failed with a validation error after the user
 * had already chosen the audience, the template and the name.
 *
 * So the number lives here, and the picker's ceiling, the list route's schema,
 * the member writer and the send-time member loader all read it. Raising it
 * raises all four together, which is the point.
 *
 * The current implementation supports full large campaign audiences up to 100,000
 * selected donors in one saved list. The UI, API validator, member writer and send
 * path share this ceiling so "select all" never silently truncates at 5,000.
 */
export const AUDIENCE_SELECTION_MAX = 100000;

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
 * This is still a stored list of ids. For audiences in the tens of thousands
 * the right shape is a stored *definition* (the filter the picker used) that
 * the sender resolves at run time  a follow-up, tracked separately; until it
 * exists this constant is the honest boundary of the feature, and both the UI
 * and the API say the same thing about where it is.
 */
export const AUDIENCE_SELECTION_MAX = 5000;

/**
 * The wizard redirects here on success and /account reads the marker to confirm
 * the submission once. Shared so the two sides cannot drift apart.
 */
export const SUBMITTED_PARAM = "bewerbung";
export const SUBMITTED_VALUE = "eingereicht";
export const SUBMITTED_URL = `/account?${SUBMITTED_PARAM}=${SUBMITTED_VALUE}`;

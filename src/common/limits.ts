// Input caps (D-18): constants reviewed like code, never environment settings.

// Weights and sets
export const MAX_WEIGHT = 10_000;
export const MAX_WEIGHT_DECIMALS = 3;
export const MAX_REPS = 1_000;
export const MAX_SETS = 50;
export const MAX_BULK = 100;

// Names
export const MAX_NAME_LENGTH = 100;
export const MAX_KEY_LENGTH = 100;
export const MAX_GROUP_NAME_LENGTH = 40;
export const MAX_GROUPS_PER_EXERCISE = 10;

// Paging
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

// Requests
export const USER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
export const BODY_LIMIT = '1mb';

// Time
export const FUTURE_TOLERANCE_MS = 15 * 60_000;
export const EARLIEST_INSTANT = '1900-01-01T00:00:00Z';

// Storage
export const WEIGHT_KG_INTEGER_DIGITS = 6;

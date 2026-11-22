// Session advisory lock keys (pg_advisory_lock). One key per kind of writer,
// so the steps that must not overlap wait for each other.

// Held around the whole migrate step: the migrations, then the catalog seed.
export const MIGRATE_LOCK = 4242001;

// For the catalog's writes (design §10.3).
export const CATALOG_WRITE_LOCK = 4242002;

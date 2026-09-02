import bcrypt from "bcryptjs";

/**
 * Kept out of `server/auth.ts` so scripts (seeding, tests) can hash a password
 * without pulling in `server-only` and the Next request context.
 */
const COST = 12;

/** Constant used when no account matched, so a miss costs the same as a hit. */
export const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEe.oQPvXpUxCq0LhTQVoIhZTvZQ1sRYYqu";

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

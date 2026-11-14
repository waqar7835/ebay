/**
 * The secret that signs login tokens (and derives the key for secrets stored in the database). There is no fallback:
 * a missing or placeholder secret would let anyone mint tokens, so the backend refuses to start without a real one.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === "change-me") {
    throw new Error("JWT_SECRET is not set (or is the placeholder \"change-me\"). Set a long random value, e.g. `openssl rand -base64 48`.");
  }
  return secret;
}

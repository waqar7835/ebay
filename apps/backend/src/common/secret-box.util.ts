import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Small AES-256-GCM helper for secrets stored in the database (the SMTP password). The key is derived from
 * JWT_SECRET, so rotating JWT_SECRET means re-entering those secrets in the backoffice.
 */
function key(): Buffer {
  return createHash("sha256")
    .update(`${process.env.JWT_SECRET ?? "change-me"}:platform-settings`)
    .digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Returns null when the value can't be decrypted (e.g. JWT_SECRET changed). */
export function decryptSecret(stored: string | null): string | null {
  if (!stored) return null;
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

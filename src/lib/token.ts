// Signed session tokens shared by student and organiser logins. No server-only/next imports so proxy.ts can use it.
import { createHmac, timingSafeEqual } from "node:crypto";

function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing — add it to .env.local and restart the dev server.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** "<subject>.<expiresAtMs>.<hmac>" */
export function makeToken(subject: string, maxAgeSec: number, now = Date.now()) {
  const payload = `${subject}.${now + maxAgeSec * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** The subject if the token is genuine and unexpired, else null. */
export function readToken(token: string | undefined, now = Date.now()) {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  const [subject, exp] = payload.split(".");
  return Number(exp) > now ? subject : null;
}

/** Constant-time string compare for the organiser passcode. */
export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const ADMIN_COOKIE = "relay_admin";
export const ADMIN_MAX_AGE = 60 * 60 * 12; // one working day

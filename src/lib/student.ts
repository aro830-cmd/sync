import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "@/lib/server";
import { makeToken, readToken } from "@/lib/token";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;
const COOKIE = "relay_student";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type Student = { id: string; name: string; email: string; usn: string | null };

export async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(pw, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = await scrypt(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startSession(studentId: string) {
  (await cookies()).set(COOKIE, makeToken(studentId, MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in student, or null. Re-checks the DB so deleted accounts lose access. */
export async function currentStudent(): Promise<Student | null> {
  const id = readToken((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const { data } = await db().from("students").select("id, name, email, usn").eq("id", id).maybeSingle();
  return data;
}

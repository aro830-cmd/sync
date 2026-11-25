import "server-only";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { withFallback } from "@/lib/retry";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, readToken } from "@/lib/token";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing — add it to .env.local and restart the dev server.`);
  return v;
}

export function db() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

// Used only when the configured model stays overloaded (503) after retries.
const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash"];

/** Ask Gemini for JSON. The agent code, not the model, performs side effects. */
export async function llm<T>(prompt: string): Promise<T> {
  const ai = new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") });
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const res = await withFallback([primary, ...FALLBACK_MODELS.filter((m) => m !== primary)], (model) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      // A hung call would freeze the whole pipeline; 35s is well above a normal agent reply.
      config: { responseMimeType: "application/json", temperature: 0.4, abortSignal: AbortSignal.timeout(35_000) },
    }),
  );
  try {
    return JSON.parse(res.text ?? "") as T;
  } catch {
    throw new Error("Gemini returned malformed JSON. Run the agent again.");
  }
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  const user = env("GMAIL_USER");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: env("GMAIL_APP_PASSWORD") },
  });
  return transport.sendMail({ from: `Relay <${user}>`, ...opts });
}

/** Admin check for Server Actions. Proxy guards /dashboard pages; actions are reachable from any page, so check again. */
export async function requireAdmin() {
  const pass = process.env.ADMIN_PASSCODE;
  if (!pass) {
    if (process.env.NODE_ENV === "production") throw new Error("ADMIN_PASSCODE must be set in production.");
    return;
  }
  if (readToken((await cookies()).get(ADMIN_COOKIE)?.value) !== "admin") throw new Error("Your organiser session ended. Log in again.");
}

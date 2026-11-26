import "server-only";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import { geminiError, withFallback } from "@/lib/retry";
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

// Used when the configured model stays overloaded (503) or out of quota (429). Free-tier quota is per model,
// so every extra model is extra headroom; the lite and Gemma models have the most generous limits.
const FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemma-4-26b-a4b-it", "gemma-4-31b-it"];

// model|key → time its quota error expires. Skipping known-exhausted options saves a round trip each call.
// ponytail: per-process memory, resets on restart; fine for one server.
const cooling = new Map<string, number>();

/** Ask Gemini for JSON. The agent code, not the model, performs side effects. */
export async function llm<T>(prompt: string): Promise<T> {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
  // GEMINI_API_KEY_FALLBACK (optional, comma-separated) adds more quota. Order: best model on every key, then the next model.
  const keys = [env("GEMINI_API_KEY"), ...(process.env.GEMINI_API_KEY_FALLBACK ?? "").split(",")].map((k) => k.trim()).filter(Boolean);
  const all = models.flatMap((model) => keys.map((apiKey) => ({ model, apiKey })));
  const attempt = () => {
    const now = Date.now();
    const fresh = all.filter((c) => (cooling.get(c.model + c.apiKey) ?? 0) < now);
    return withFallback(fresh.length ? fresh : all, ({ model, apiKey }) =>
      new GoogleGenAI({ apiKey }).models
        .generateContent({
          model,
          contents: prompt,
          // A hung call would freeze the whole pipeline; 35s is well above a normal agent reply.
          config: { responseMimeType: "application/json", temperature: 0.4, abortSignal: AbortSignal.timeout(35_000) },
        })
        .catch((e) => {
          if (geminiError(e).quota) cooling.set(model + apiKey, Date.now() + 60_000);
          throw e;
        }),
    );
  };
  let res;
  try {
    res = await attempt();
  } catch (e) {
    // Free-tier limits are mostly per minute: when every option is out of quota, wait once and go again.
    if (!geminiError(e).quota) throw geminiError(e);
    await new Promise((r) => setTimeout(r, 20_000));
    try {
      res = await attempt();
    } catch (e2) {
      const err = geminiError(e2);
      if (err.quota) throw new Error(`Gemini is out of quota on ${keys.length === 1 ? "the API key" : `all ${keys.length} API keys`} right now. Wait a minute and run the agent again, or add another key to GEMINI_API_KEY_FALLBACK in .env.local (comma-separated).`);
      throw err;
    }
  }
  try {
    // Some fallback models wrap JSON in a markdown fence; strip it.
    return JSON.parse((res.text ?? "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as T;
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

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export type PosterEvent = {
  id: string;
  name: string | null;
  theme: string | null;
  date: string | null;
  venue: string | null;
  expected_attendees: number | null;
  plan: { kind?: string } | null;
  partners: string[];
};

export const POSTER = { width: 1080, height: 1350 }; // Instagram portrait

let fox: string | null = null;
let black: Buffer | null = null;
async function mascot() {
  fox ??= `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/fox/poster-fox.png"))).toString("base64")}`;
  return fox;
}
// Archivo Black (OFL, src/lib/fonts) for the headline; body text uses the built-in font.
async function display() {
  black ??= await readFile(path.join(process.cwd(), "src/lib/fonts/ArchivoBlack-Regular.ttf"));
  return black;
}

/** The event poster as a PNG (Instagram portrait): name, theme, date, venue, entry, partners, the fox, and the sign-up link. */
export async function posterPng(e: PosterEvent, registerUrl: string) {
  const free = e.plan?.kind === "free";
  const d = e.date ? new Date(e.date) : null;
  const name = e.name ?? "Coming soon";
  const nameSize = name.length > 26 ? 84 : name.length > 16 ? 100 : 124;
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0c0907", color: "#f5ede5", padding: 72, position: "relative", fontFamily: "sans-serif" }}>
        {/* warm glow + fox */}
        <div style={{ position: "absolute", right: -260, top: 300, width: 900, height: 900, borderRadius: 900, background: "radial-gradient(circle, rgba(255,122,46,.9) 0%, rgba(233,84,26,.55) 35%, rgba(12,9,7,0) 70%)", display: "flex" }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img */}
        <img src={await mascot()} width={600} height={600} style={{ position: "absolute", right: -30, bottom: 210 }} alt="" />

        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, letterSpacing: 6, color: "#ff7a2e", fontFamily: "Archivo Black" }}>
          RELAY · CLUB EVENTS
        </div>
        <div style={{ display: "flex", marginTop: 26 }}>
          <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: free ? "#00a888" : "#ec6426", color: "#fff", fontSize: 24, fontFamily: "Archivo Black", letterSpacing: 3 }}>
            {free ? "FREE ENTRY" : "FOOD · PRIZES · SWAG"}
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 48, fontSize: nameSize, fontFamily: "Archivo Black", lineHeight: 0.98, letterSpacing: -2, maxWidth: 900, textTransform: "uppercase" }}>{name}</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 36, lineHeight: 1.25, color: "#d9c8b8", maxWidth: 620 }}>{e.theme ?? ""}</div>

        {/* date + venue */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 56 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 150, height: 160, borderRadius: 28, border: "3px solid #ff7a2e" }}>
            <div style={{ display: "flex", fontSize: 28, color: "#ff7a2e", fontWeight: 700, letterSpacing: 4 }}>{d ? d.toLocaleDateString("en-IN", { month: "short" }).toUpperCase() : "TBA"}</div>
            <div style={{ display: "flex", fontSize: 72, fontFamily: "Archivo Black", lineHeight: 1 }}>{d ? String(d.getDate()) : "—"}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 380 }}>
            <div style={{ display: "flex", fontSize: 34, fontFamily: "Archivo Black" }}>{d ? `${d.toLocaleDateString("en-IN", { weekday: "long" })}, ${d.getFullYear()}` : "Date to be announced"}</div>
            <div style={{ display: "flex", fontSize: 28, color: "#b0a294" }}>{e.venue ?? ""}</div>
            {e.expected_attendees ? <div style={{ display: "flex", fontSize: 26, color: "#b0a294" }}>{`${e.expected_attendees} seats`}</div> : null}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 18 }}>
          {e.partners.length ? (
            <div style={{ display: "flex", fontSize: 24, color: "#b0a294", letterSpacing: 2 }}>{`PARTNERS  ·  ${e.partners.slice(0, 4).join("  ·  ").toUpperCase()}`}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 34px", borderRadius: 28, background: "#f5ede5", color: "#0c0907" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 40, fontFamily: "Archivo Black" }}>Register now</div>
              <div style={{ display: "flex", fontSize: 19, color: "#5a4d42", maxWidth: 760 }}>{registerUrl.replace(/^https?:\/\//, "")}</div>
            </div>
            <div style={{ display: "flex", width: 76, height: 76, borderRadius: 76, background: "#ec6426", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 800 }}>→</div>
          </div>
        </div>
      </div>
    ),
    { ...POSTER, fonts: [{ name: "Archivo Black", data: await display(), weight: 400, style: "normal" }] },
  );
  return Buffer.from(await img.arrayBuffer());
}

/** Event + confirmed partner names, ready for the poster. */
export async function posterEvent(id: string): Promise<PosterEvent | null> {
  const { db } = await import("@/lib/server");
  const [ev, sp] = await Promise.all([
    db().from("events").select("id, name, theme, date, venue, expected_attendees, plan").eq("id", id).maybeSingle(),
    db().from("sponsors").select("company").eq("event_id", id).eq("status", "confirmed"),
  ]);
  if (!ev.data) return null;
  return { ...ev.data, partners: (sp.data ?? []).map((s) => s.company) };
}

/** Absolute base URL for links in emails and on the poster: APP_URL if set, else the request's own host. */
export async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

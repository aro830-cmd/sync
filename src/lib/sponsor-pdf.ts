import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { clean, wrap } from "./pdf";

const PAPER = rgb(0.98, 0.972, 0.96);
const NIGHT = rgb(0.047, 0.035, 0.027);
const INK = rgb(0.086, 0.082, 0.075);
const MUTED = rgb(0.4, 0.38, 0.34);
const ACCENT = rgb(0.925, 0.392, 0.149);
const TEAL = rgb(0, 0.659, 0.533);
const LINE = rgb(0.87, 0.85, 0.82);
const CREAM = rgb(0.96, 0.93, 0.9);
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

/** A small flowing-layout writer shared by the proposal and the ROI report. */
async function writer(kind: string, title: string, subtitle: string[], chip: string) {
  const doc = await PDFDocument.create();
  doc.setAuthor("Relay");
  doc.setTitle(clean(`${title} - ${kind}`));
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  let fox: PDFImage | null = null;
  try {
    fox = await doc.embedPng(await readFile(path.join(process.cwd(), "public/fox/poster-fox.png")));
  } catch {
    // decoration only
  }
  const W = 595, H = 842, X = 48, CW = W - 2 * X, BOTTOM = 64;
  let page!: PDFPage;
  let y = 0;
  const text = (t: string, x: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => page.drawText(clean(t), { x, y: yy, size, font, color });
  const right = (t: string, xr: number, yy: number, size: number, font: PDFFont, color: RGB = INK) => text(t, xr - font.widthOfTextAtSize(clean(t), size), yy, size, font, color);
  const newPage = () => {
    page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ACCENT });
    text(clean(title).toUpperCase(), X, H - 34, 7.5, mono, MUTED);
    right(kind.toUpperCase(), W - X, H - 34, 7.5, mono, ACCENT);
    y = H - 70;
  };
  const need = (h: number) => y - h < BOTTOM && newPage();

  // cover band
  page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  const band = 230;
  page.drawRectangle({ x: 0, y: H - band, width: W, height: band, color: NIGHT });
  page.drawCircle({ x: W - 110, y: H - 120, size: 130, color: ACCENT, opacity: 0.3 });
  if (fox) page.drawImage(fox, { x: W - 210, y: H - band, width: 200, height: 200 });
  page.drawRectangle({ x: 0, y: 0, width: W, height: H - band, color: PAPER });
  text("RELAY", X, H - 50, 9, bold, ACCENT);
  text(kind.toUpperCase(), X + 42, H - 50, 9, mono, CREAM);
  let ty = H - 96;
  for (const l of wrap(title, bold, 26, W - X - 230).slice(0, 2)) {
    text(l, X, ty, 26, bold, rgb(1, 1, 1));
    ty -= 30;
  }
  for (const l of subtitle) {
    text(l, X, ty, 9.5, mono, CREAM);
    ty -= 14;
  }
  page.drawRectangle({ x: X, y: H - band + 22, width: mono.widthOfTextAtSize(clean(chip), 8) + 18, height: 18, color: ACCENT });
  text(chip, X + 9, H - band + 28, 8, mono, rgb(1, 1, 1));
  y = H - band - 40;

  return {
    doc,
    section(label: string, heading: string) {
      need(70);
      y -= 6;
      text(label, X, y, 7.5, mono, ACCENT);
      y -= 20;
      text(heading, X, y, 15, bold);
      y -= 18;
    },
    para(t: string, size = 10.5, color: RGB = INK) {
      for (const l of wrap(t, sans, size, CW)) {
        need(15);
        text(l, X, y, size, sans, color);
        y -= 15;
      }
      y -= 4;
    },
    bullets(items: string[]) {
      for (const it of items)
        for (const [i, l] of wrap(it, sans, 10, CW - 16).entries()) {
          need(14);
          if (!i) page.drawCircle({ x: X + 4, y: y + 3, size: 2, color: ACCENT });
          text(l, X + 14, y, 10, sans);
          y -= 14;
        }
      y -= 6;
    },
    kpis(items: [string, string][]) {
      need(80);
      const kw = (CW - (items.length - 1) * 10) / items.length;
      items.forEach(([v, l], i) => {
        const kx = X + i * (kw + 10);
        page.drawRectangle({ x: kx, y: y - 62, width: kw, height: 62, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.7 });
        page.drawRectangle({ x: kx, y: y - 3, width: kw, height: 3, color: i % 2 ? TEAL : ACCENT });
        text(l, kx + 10, y - 18, 6.8, mono, MUTED);
        text(v, kx + 10, y - 44, Math.min(20, (kw - 20) / Math.max(1, bold.widthOfTextAtSize(clean(v), 1))), bold);
      });
      y -= 84;
    },
    rows(head: string[], rows: string[][], widths: number[]) {
      need(30);
      let x = X;
      head.forEach((h, i) => (text(h, x, y, 7, mono, MUTED), (x += widths[i] * CW)));
      y -= 8;
      page.drawLine({ start: { x: X, y }, end: { x: W - X, y }, thickness: 0.5, color: LINE });
      y -= 14;
      for (const r of rows) {
        need(18);
        x = X;
        r.forEach((c, i) => {
          const max = widths[i] * CW - 8;
          let s = clean(c);
          while (s.length > 3 && sans.widthOfTextAtSize(s, 9.5) > max) s = s.slice(0, -2);
          text(s === clean(c) ? s : s + "…", x, y, 9.5, i ? sans : bold, INK);
          x += widths[i] * CW;
        });
        y -= 7;
        page.drawLine({ start: { x: X, y }, end: { x: W - X, y }, thickness: 0.3, color: LINE });
        y -= 12;
      }
      y -= 6;
    },
    async save() {
      const pages = doc.getPages();
      const stamp = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      pages.forEach((p, i) => {
        p.drawLine({ start: { x: X, y: 44 }, end: { x: W - X, y: 44 }, thickness: 0.5, color: LINE });
        p.drawText(clean(`Generated by Relay on ${stamp}`), { x: X, y: 30, size: 7, font: mono, color: MUTED });
        const n = `Page ${i + 1} of ${pages.length}`;
        p.drawText(n, { x: W - X - mono.widthOfTextAtSize(n, 7), y: 30, size: 7, font: mono, color: MUTED });
      });
      return Buffer.from(await doc.save());
    },
  };
}

export type SponsorDocData = {
  company: string;
  event: { name: string; theme: string; date: string; venue: string; expected: number; budget: number; free: boolean };
  tier: { name: string; amount: number; perks: string[] } | null;
  value: number | null;
  contribution: string | null;
  terms: Record<string, string>;
  payments: { label: string; amount: number; received: number; due: string | null; status: string }[];
  deliverables: { item: string; done: boolean; evidence: string | null; due: string | null }[];
  stats: { registered: number; attended: number; certificates: number; socialReach: number | null; challenge: number | null; photos: string[] };
  club: string;
};

const day = (d: string) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "Date TBA");
const TERM_LABEL: Record<string, string> = { obligations: "Obligations", exclusivity: "Exclusivity", data_sharing: "Data sharing", branding: "Branding deliverables", payment_terms: "Payment terms", reporting: "Reporting", deadline: "Deadline" };

/** Tailored sponsorship proposal: event, audience, the package, publicity plan, terms and next steps. */
export async function proposalPdf(d: SponsorDocData) {
  const ask = d.value ?? d.tier?.amount ?? 0;
  const w = await writer(`Proposal for ${d.company}`, d.event.name, [day(d.event.date), d.event.venue], `${d.tier?.name ?? "Partner"} package - ${ask ? rs(ask) : "in kind"}`);
  w.section("01 / THE EVENT", `${d.event.name}`);
  w.para(`${d.event.theme}. We expect around ${d.event.expected} students — mostly engineering undergraduates who build, ship and choose the tools they'll use at work.`);
  w.kpis([[String(d.event.expected), "EXPECTED STUDENTS"], [day(d.event.date).split(" ").slice(0, 2).join(" "), "EVENT DAY"], [ask ? rs(ask) : "In kind", "YOUR PACKAGE"]]);
  w.section("02 / THE PACKAGE", `${d.tier?.name ?? "Partner"} partnership for ${d.company}`);
  w.para(`We're asking ${d.company} for ${ask ? rs(ask) : "in-kind support"}${d.contribution ? ` (${d.contribution})` : ""}. It goes directly into running the event: food, prizes, venue and printing.`);
  w.bullets(d.tier?.perks.length ? d.tier.perks : ["Logo placement", "Mention on stage"]);
  w.section("03 / PUBLICITY", "What your brand gets");
  w.bullets([
    "Logo on every poster, standee and the stage backdrop",
    "3 dedicated posts across the club's Instagram and LinkedIn",
    "A thank-you mention on stage at the opening and the closing",
    "Logo and link on the public registration page",
    "A post-event report with real attendance numbers, photos and how your brand was featured",
  ]);
  const terms = Object.entries(d.terms).filter(([, v]) => v);
  if (terms.length) {
    w.section("04 / TERMS", "What we've agreed so far");
    w.rows(["ITEM", "DETAIL"], terms.map(([k, v]) => [TERM_LABEL[k] ?? k, v]), [0.3, 0.7]);
  }
  w.section(terms.length ? "05 / NEXT STEPS" : "04 / NEXT STEPS", "How we'd work together");
  w.bullets([`Reply to confirm the package${d.terms.deadline ? ` by ${d.terms.deadline}` : ""}`, "We send an invoice and a short agreement", "We share artwork for approval two weeks before the event", "You receive the post-event report within a week of the event"]);
  w.para(`Thank you for considering ${d.event.name}. — ${d.club}`, 10.5, MUTED);
  return w.save();
}

/** Post-event ROI report for one sponsor: reach, participation, branding delivered with evidence, and payments. */
export async function roiPdf(d: SponsorDocData) {
  const w = await writer(`Partner report for ${d.company}`, d.event.name, [day(d.event.date), d.event.venue], `${d.tier?.name ?? "Partner"} partner`);
  const turnout = d.stats.registered ? Math.round((d.stats.attended / d.stats.registered) * 100) : 0;
  w.section("01 / REACH", "Who you reached");
  w.kpis([
    [String(d.stats.registered), "REGISTERED"],
    [String(d.stats.attended), "ATTENDED"],
    [`${turnout}%`, "TURNOUT"],
    [d.stats.socialReach != null ? d.stats.socialReach.toLocaleString("en-IN") : "-", "SOCIAL REACH"],
  ]);
  if (d.stats.challenge != null) w.para(`${d.stats.challenge} students took part in the sponsored challenge or workshop.`);
  w.para("Numbers are from Relay's registration and check-in records; social reach is as recorded by the club. A dash means it wasn't recorded.", 9, MUTED);
  w.section("02 / BRANDING", "What we delivered");
  if (d.deliverables.length) w.rows(["DELIVERABLE", "STATUS", "EVIDENCE"], d.deliverables.map((x) => [x.item, x.done ? "Delivered" : "Pending", x.evidence ?? "-"]), [0.5, 0.15, 0.35]);
  else w.para("No deliverables were recorded for this partnership.", 10, MUTED);
  if (d.stats.photos.length) {
    w.section("03 / PHOTOS", "Links to photos from the day");
    w.bullets(d.stats.photos);
  }
  w.section(d.stats.photos.length ? "04 / PAYMENTS" : "03 / PAYMENTS", "Contribution received");
  if (d.payments.length) {
    w.rows(["MILESTONE", "AMOUNT", "RECEIVED", "STATUS"], d.payments.map((p) => [p.label, rs(p.amount), rs(p.received), p.status.replace(/_/g, " ")]), [0.4, 0.2, 0.2, 0.2]);
  } else w.para(`Package value: ${d.value ? rs(d.value) : d.tier?.amount ? rs(d.tier.amount) : "in kind"}. No payment milestones were recorded.`, 10, MUTED);
  w.para(`Thank you for partnering with ${d.event.name}. — ${d.club}`, 10.5, MUTED);
  return w.save();
}

/** Gather everything the sponsor documents need. */
export async function sponsorDocData(sponsorId: string): Promise<SponsorDocData | null> {
  const { db } = await import("./server");
  const d = db();
  const s = await d.from("sponsors").select("*").eq("id", sponsorId).maybeSingle();
  if (!s.data) return null;
  const sp = s.data;
  const [ev, att, pay, del] = await Promise.all([
    d.from("events").select("*").eq("id", sp.event_id).single(),
    d.from("attendees").select("checked_in, certificate_sent").eq("event_id", sp.event_id),
    d.from("sponsor_payments").select("*").eq("sponsor_id", sponsorId).order("due_date"),
    d.from("sponsor_deliverables").select("*").eq("sponsor_id", sponsorId).order("due_date"),
  ]);
  const e = ev.data!, plan = e.plan ?? {}, m = plan.metrics ?? {};
  const tier = (plan.tiers ?? []).find((t: { name: string }) => t.name === sp.tier) ?? null;
  return {
    company: sp.company,
    event: { name: e.name ?? "Event", theme: e.theme ?? "", date: e.date ?? "", venue: e.venue ?? "", expected: e.expected_attendees ?? 0, budget: e.budget ?? 0, free: plan.kind === "free" },
    tier,
    value: sp.value ?? null,
    contribution: sp.contribution_type ?? null,
    terms: sp.terms ?? {},
    payments: (pay.data ?? []).map((p) => ({ label: p.label, amount: p.amount, received: p.received_amount, due: p.due_date, status: p.status })),
    deliverables: (del.data ?? []).map((x) => ({ item: x.item, done: x.done, evidence: x.evidence_url, due: x.due_date })),
    stats: {
      registered: att.data?.length ?? 0,
      attended: att.data?.filter((a) => a.checked_in).length ?? 0,
      certificates: att.data?.filter((a) => a.certificate_sent).length ?? 0,
      socialReach: typeof m.social_reach === "number" ? m.social_reach : null,
      challenge: typeof m.challenge_participants === "number" ? m.challenge_participants : null,
      photos: Array.isArray(m.photos) ? m.photos : [],
    },
    club: `Team ${e.name ?? "Relay"}`,
  };
}

import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

const INK = rgb(0.086, 0.082, 0.075);
const MUTED = rgb(0.34, 0.33, 0.29);
const SIGNAL = rgb(0.83, 0.27, 0.12);

// Standard PDF fonts only cover Latin-1; LLM text often has ₹, smart quotes, dashes.
export const clean = (s: string) =>
  s
    .replace(/₹/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

export function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const para of clean(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function centered(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color = INK) {
  const t = clean(text);
  page.drawText(t, { x: (page.getWidth() - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
}

export async function certificatePdf(o: { name: string; event: string; date: string; club: string }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await doc.embedFont(StandardFonts.Courier);

  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(0.953, 0.941, 0.91) });
  page.drawRectangle({ x: 28, y: 28, width: 786, height: 539, borderColor: INK, borderWidth: 0.75 });
  centered(page, "CERTIFICATE OF PARTICIPATION", 470, mono, 11, MUTED);
  centered(page, "This is presented to", 400, italic, 20, MUTED);
  centered(page, o.name, 330, serif, 54);
  page.drawLine({ start: { x: 271, y: 315 }, end: { x: 571, y: 315 }, thickness: 1, color: SIGNAL });
  centered(page, `for taking part in ${o.event}`, 270, italic, 20, MUTED);
  centered(page, o.date, 240, mono, 11, MUTED);
  centered(page, o.club, 90, serif, 14);
  centered(page, "Issued automatically by Relay", 70, mono, 8, MUTED);
  return Buffer.from(await doc.save());
}

export type ReportData = {
  event: string;
  theme: string;
  date: string;
  venue: string;
  free: boolean;
  summary: string;
  expected: number | null;
  budget: number;
  registered: number;
  attended: number;
  certificates: number;
  /** Registrations per day, oldest first. */
  daily: { day: string; n: number }[];
  budgetSplit: { head: string; amount: number }[];
  tiers: { name: string; amount: number; perks: string[] }[];
  funnel: { leads: number; pitched: number; replied: number; confirmed: number; declined: number };
  partners: { company: string; tier: string | null; amount: number }[];
  timeline: { date: string; milestone: string }[];
  volunteers: number;
  shifts: { time: string; title: string; who: string }[];
  hours: number;
};

const PAPER = rgb(0.98, 0.972, 0.96);
const NIGHT = rgb(0.047, 0.035, 0.027);
const ACCENT = rgb(0.925, 0.392, 0.149); // #ec6426
const TEAL = rgb(0, 0.659, 0.533); // #00a888
const BLUE = rgb(0.2, 0.549, 0.929); // #338ced
const AMBER = rgb(0.753, 0.514, 0.016); // #c08304
const LINE = rgb(0.87, 0.85, 0.82);
const SOFT = rgb(0.94, 0.925, 0.9);
const CREAM = rgb(0.96, 0.93, 0.9);
const SERIES = [ACCENT, BLUE, TEAL, AMBER, rgb(0.886, 0.302, 0.545)];
const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Multi-page A4 report: cover band with the mascot, KPIs, summary, charts, money, sponsors, timeline, logistics. */
export async function reportPdf(o: ReportData) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${clean(o.event)} - ${o.free ? "Event" : "Sponsor"} report`);
  doc.setAuthor("Relay");
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  let fox: PDFImage | null = null;
  try {
    fox = await doc.embedPng(await readFile(path.join(process.cwd(), "public/fox/mascot.png")));
  } catch {
    // the mascot is decoration; the report still renders without it
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
    text(clean(o.event).toUpperCase(), X, H - 34, 7.5, mono, MUTED);
    right(o.free ? "EVENT REPORT" : "SPONSOR REPORT", W - X, H - 34, 7.5, mono, ACCENT);
    page.drawLine({ start: { x: X, y: H - 44 }, end: { x: W - X, y: H - 44 }, thickness: 0.5, color: LINE });
    y = H - 72;
  };
  const need = (h: number) => {
    if (y - h < BOTTOM) newPage();
  };
  const section = (label: string, title: string) => {
    need(70);
    y -= 8;
    text(label, X, y, 7.5, mono, ACCENT);
    y -= 20;
    text(title, X, y, 16, bold);
    y -= 18;
  };
  const para = (t: string, size = 10.5, lead = 15.5, color: RGB = INK) => {
    for (const line of wrap(t, sans, size, CW)) {
      need(lead);
      text(line, X, y, size, sans, color);
      y -= lead;
    }
  };

  // ── cover band ──
  page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  const bandH = 250;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: NIGHT });
  page.drawCircle({ x: W - 120, y: H - 120, size: 150, color: ACCENT, opacity: 0.22 });
  page.drawCircle({ x: W - 120, y: H - 120, size: 95, color: ACCENT, opacity: 0.35 });
  if (fox) page.drawImage(fox, { x: W - 236, y: H - bandH, width: 230, height: 230 });
  page.drawRectangle({ x: 0, y: 0, width: W, height: H - bandH, color: PAPER }); // clip the glow at the band edge
  text("RELAY", X, H - 52, 9, bold, ACCENT);
  text(o.free ? "EVENT REPORT" : "SPONSOR REPORT", X + 42, H - 52, 9, mono, CREAM);
  let ty = H - 104;
  for (const line of wrap(o.event, bold, 28, W - X - 250).slice(0, 3)) {
    text(line, X, ty, 28, bold, rgb(1, 1, 1));
    ty -= 32;
  }
  for (const line of wrap(o.theme, sans, 10.5, W - X - 250).slice(0, 2)) {
    text(line, X, ty, 10.5, sans, CREAM);
    ty -= 14;
  }
  ty -= 8;
  text(`${o.date ? new Date(o.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Date TBA"}`, X, ty, 9.5, mono, CREAM);
  text(o.venue, X, ty - 14, 9.5, mono, rgb(0.69, 0.64, 0.58));
  const chip = o.free ? "FREE EVENT" : `FUNDED - ${rs(o.budget)}`;
  page.drawRectangle({ x: X, y: H - bandH + 22, width: mono.widthOfTextAtSize(chip, 8) + 18, height: 18, color: o.free ? TEAL : ACCENT, opacity: 0.95 });
  text(chip, X + 9, H - bandH + 28, 8, mono, rgb(1, 1, 1));
  y = H - bandH - 34;

  // ── KPI cards ──
  const turnout = o.registered ? Math.round((o.attended / o.registered) * 100) : 0;
  const raised = o.partners.reduce((s, p) => s + p.amount, 0);
  const kpis: [string, string, string][] = [
    [String(o.registered), "REGISTERED", o.expected ? `of ${o.expected} expected` : ""],
    [String(o.attended), "ATTENDED", `${o.certificates} certificates sent`],
    [`${turnout}%`, "TURNOUT", "checked in / registered"],
    o.free ? [o.expected ? `${Math.round((o.registered / o.expected) * 100)}%` : "-", "SEATS FILLED", "no budget, no sponsors"] : [rs(raised), "RAISED", o.budget ? `${Math.round((raised / o.budget) * 100)}% of the budget` : ""],
  ];
  const kw = (CW - 3 * 10) / 4;
  kpis.forEach(([v, l, hint], i) => {
    const kx = X + i * (kw + 10);
    page.drawRectangle({ x: kx, y: y - 74, width: kw, height: 74, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.7 });
    page.drawRectangle({ x: kx, y: y - 3, width: kw, height: 3, color: SERIES[i] });
    text(l, kx + 12, y - 20, 7, mono, MUTED);
    const size = Math.min(22, (kw - 24) / Math.max(1, bold.widthOfTextAtSize(clean(v), 1))); // shrink long money values to fit
    text(v, kx + 12, y - 46, size, bold);
    text(hint, kx + 12, y - 62, 7, sans, MUTED);
  });
  y -= 100;

  // ── summary ──
  section("01 / SUMMARY", o.free ? "How it went" : "Report to our partners");
  para(o.summary);
  y -= 10;

  // ── registrations chart ──
  section("02 / AUDIENCE", "Registrations and turnout");
  const ch = 120;
  need(ch + 70);
  if (o.daily.length) {
    const max = Math.max(1, ...o.daily.map((d) => d.n));
    const top = Math.max(2, Math.ceil(max / 2) * 2); // even, so the midline tick is a whole number
    const bw = Math.min(18, (CW - 30) / o.daily.length - 2);
    const gx = X + 30;
    for (const v of [0, top / 2, top]) {
      const gy = y - ch + (v / top) * ch;
      page.drawLine({ start: { x: gx, y: gy }, end: { x: W - X, y: gy }, thickness: 0.4, color: LINE });
      right(String(v), gx - 6, gy - 3, 7, mono, MUTED);
    }
    let cum = 0;
    const pts: string[] = [];
    o.daily.forEach((d, i) => {
      const bx = gx + 4 + i * ((CW - 34) / o.daily.length);
      const h = (d.n / top) * ch;
      if (h > 0) page.drawRectangle({ x: bx, y: y - ch, width: bw, height: h, color: BLUE });
      cum += d.n;
      pts.push(`${i ? "L" : "M"}${(bx + bw / 2).toFixed(1)},${(-((cum / Math.max(1, o.registered)) * ch)).toFixed(1)}`);
    });
    // cumulative share as a line on top (0-100% of final registrations, same height)
    page.drawSvgPath(pts.join(" "), { x: 0, y: y - ch, borderColor: ACCENT, borderWidth: 1.6 });
    text(day(o.daily[0].day), gx, y - ch - 14, 7, mono, MUTED);
    right(day(o.daily[o.daily.length - 1].day), W - X, y - ch - 14, 7, mono, MUTED);
    y -= ch + 30;
    page.drawRectangle({ x: X, y: y + 2, width: 8, height: 8, color: BLUE });
    text("New registrations per day", X + 14, y + 3, 8, sans, MUTED);
    page.drawRectangle({ x: X + 150, y: y + 5, width: 12, height: 2, color: ACCENT });
    text("Running total (share of final)", X + 168, y + 3, 8, sans, MUTED);
    y -= 24;
  } else {
    para("No registrations yet.", 10, 14, MUTED);
  }
  // turnout meter
  need(40);
  text("Turnout", X, y, 9, bold);
  right(`${o.attended} of ${o.registered} (${turnout}%)`, W - X, y, 9, sans, MUTED);
  y -= 12;
  page.drawRectangle({ x: X, y: y - 8, width: CW, height: 8, color: SOFT });
  page.drawRectangle({ x: X, y: y - 8, width: Math.max(2, (CW * turnout) / 100), height: 8, color: TEAL });
  y -= 30;

  // ── money ──
  if (!o.free) {
    if (o.budgetSplit.length) {
      section("03 / BUDGET", `Where ${rs(o.budget)} goes`);
      const total = o.budgetSplit.reduce((s, b) => s + b.amount, 0) || 1;
      need(30);
      let sx = X;
      o.budgetSplit.forEach((b, i) => {
        const w = (b.amount / total) * CW;
        page.drawRectangle({ x: sx, y: y - 16, width: Math.max(0, w - 2), height: 16, color: SERIES[i % SERIES.length] });
        sx += w;
      });
      y -= 34;
      for (const [i, b] of o.budgetSplit.entries()) {
        need(18);
        page.drawRectangle({ x: X, y: y - 1, width: 8, height: 8, color: SERIES[i % SERIES.length] });
        text(b.head, X + 16, y, 9.5, sans);
        right(rs(b.amount), W - X - 50, y, 9.5, bold);
        right(`${Math.round((b.amount / total) * 100)}%`, W - X, y, 9, mono, MUTED);
        y -= 17;
      }
      y -= 10;
    }

    section("04 / SPONSORSHIP", "Partners and the pipeline");
    need(70);
    const steps: [string, number][] = [["LEADS", o.funnel.leads], ["PITCHED", o.funnel.pitched], ["REPLIED", o.funnel.replied], ["CONFIRMED", o.funnel.confirmed], ["DECLINED", o.funnel.declined]];
    const fw = (CW - 4 * 8) / 5;
    steps.forEach(([l, n], i) => {
      const fx = X + i * (fw + 8);
      page.drawRectangle({ x: fx, y: y - 52, width: fw, height: 52, color: i === 3 ? rgb(0.93, 0.98, 0.96) : rgb(1, 1, 1), borderColor: i === 3 ? TEAL : LINE, borderWidth: 0.7 });
      text(String(n), fx + 10, y - 28, 18, bold, i === 3 ? TEAL : INK);
      text(l, fx + 10, y - 44, 6.8, mono, MUTED);
    });
    y -= 72;

    if (o.partners.length) {
      need(40);
      text("CONFIRMED PARTNER", X, y, 7, mono, MUTED);
      text("TIER", X + 280, y, 7, mono, MUTED);
      right("CONTRIBUTION", W - X, y, 7, mono, MUTED);
      y -= 8;
      page.drawLine({ start: { x: X, y }, end: { x: W - X, y }, thickness: 0.5, color: LINE });
      y -= 16;
      for (const p of o.partners) {
        need(20);
        text(p.company, X, y, 10.5, bold);
        text(p.tier ?? "-", X + 280, y, 9.5, sans, MUTED);
        right(p.amount ? rs(p.amount) : "In kind", W - X, y, 10, bold);
        y -= 8;
        page.drawLine({ start: { x: X, y }, end: { x: W - X, y }, thickness: 0.3, color: LINE });
        y -= 14;
      }
      need(20);
      text("Total", X, y, 10.5, bold);
      right(rs(raised), W - X, y, 11, bold, ACCENT);
      y -= 26;
    } else {
      para("No partners confirmed yet.", 10, 14, MUTED);
    }

    if (o.tiers.length) {
      need(40);
      text("TIERS AND PERKS DELIVERED", X, y, 7.5, mono, ACCENT);
      y -= 18;
      for (const t of o.tiers) {
        need(30);
        text(`${t.name}  -  ${t.amount ? rs(t.amount) : "in kind"}`, X, y, 10, bold);
        y -= 14;
        for (const line of wrap(t.perks.join(" · "), sans, 9, CW - 12)) {
          need(13);
          text(line, X + 12, y, 9, sans, MUTED);
          y -= 13;
        }
        y -= 6;
      }
    }
  }

  // ── timeline ──
  if (o.timeline.length) {
    section(o.free ? "03 / TIMELINE" : "05 / TIMELINE", "From plan to event day");
    for (const [i, m] of o.timeline.entries()) {
      need(22);
      page.drawCircle({ x: X + 4, y: y + 3, size: 3.5, color: ACCENT });
      if (i < o.timeline.length - 1) page.drawLine({ start: { x: X + 4, y: y - 2 }, end: { x: X + 4, y: y - 17 }, thickness: 0.8, color: LINE });
      text(day(m.date), X + 18, y, 9, mono, MUTED);
      for (const [k, line] of wrap(m.milestone, sans, 10, CW - 90).entries()) {
        if (k) {
          y -= 13;
          need(13);
        }
        text(line, X + 90, y, 10, sans);
      }
      y -= 21;
    }
    y -= 6;
  }

  // ── logistics ──
  section(o.free ? "04 / LOGISTICS" : "06 / LOGISTICS", "The team on the day");
  need(30);
  text(`${o.volunteers} volunteers · ${o.shifts.length} shifts · ${o.hours.toFixed(1)} hours of work · 0 clashes`, X, y, 10, sans, MUTED);
  y -= 20;
  for (const sh of o.shifts.slice(0, 18)) {
    need(16);
    text(sh.time, X, y, 8.5, mono, MUTED);
    text(sh.title, X + 82, y, 9.5, sans);
    right(sh.who, W - X, y, 9, sans, sh.who === "Unassigned" ? ACCENT : MUTED);
    y -= 15;
  }
  if (!o.shifts.length) para("No run-of-show was scheduled for this event.", 10, 14, MUTED);

  // ── footers ──
  const pages = doc.getPages();
  const stamp = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: X, y: 44 }, end: { x: W - X, y: 44 }, thickness: 0.5, color: LINE });
    p.drawText(clean(`Generated by Relay on ${stamp} from live event data`), { x: X, y: 30, size: 7, font: mono, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: W - X - mono.widthOfTextAtSize(n, 7), y: 30, size: 7, font: mono, color: MUTED });
  });
  return Buffer.from(await doc.save());
}

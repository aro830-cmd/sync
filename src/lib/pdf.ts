import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.086, 0.082, 0.075);
const MUTED = rgb(0.34, 0.33, 0.29);
const SIGNAL = rgb(0.83, 0.27, 0.12);

// Standard PDF fonts only cover Latin-1; LLM text often has ₹, smart quotes, dashes.
const clean = (s: string) =>
  s
    .replace(/₹/g, "Rs. ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number) {
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

export async function reportPdf(o: {
  event: string;
  date: string;
  venue: string;
  stats: [string, string][];
  summary: string;
  sponsors: { company: string; tier: string | null }[];
}) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const x = 56;
  let y = 770;

  page.drawText("SPONSOR REPORT", { x, y, size: 9, font: mono, color: SIGNAL });
  y -= 44;
  page.drawText(clean(o.event), { x, y, size: 34, font: serif, color: INK });
  y -= 22;
  page.drawText(clean(`${o.date} · ${o.venue}`), { x, y, size: 11, font: italic, color: MUTED });
  y -= 46;

  const colW = (595 - 2 * x) / o.stats.length;
  o.stats.forEach(([n, label], i) => {
    page.drawText(clean(n), { x: x + i * colW, y, size: 30, font: serif, color: INK });
    page.drawText(clean(label), { x: x + i * colW, y: y - 16, size: 8, font: mono, color: MUTED });
  });
  y -= 50;
  page.drawLine({ start: { x, y }, end: { x: 595 - x, y }, thickness: 0.5, color: MUTED });
  y -= 30;

  for (const line of wrap(o.summary, serif, 12, 595 - 2 * x)) {
    if (y < 140) break; // shortcut: single page, long summaries are cut — add pages if reports grow
    page.drawText(line, { x, y, size: 12, font: serif, color: INK });
    y -= 18;
  }

  y -= 20;
  page.drawText("PARTNERS", { x, y, size: 9, font: mono, color: SIGNAL });
  y -= 20;
  for (const s of o.sponsors) {
    if (y < 60) break;
    page.drawText(clean(s.company), { x, y, size: 13, font: serif, color: INK });
    page.drawText(clean(s.tier ?? ""), { x: 380, y, size: 9, font: mono, color: MUTED });
    y -= 20;
  }
  return Buffer.from(await doc.save());
}

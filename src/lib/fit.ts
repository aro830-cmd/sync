// Transparent sponsor-fit score. Pure (no imports) so `node src/lib/fit.test.ts` runs it.
// Every factor returns 0–1 plus a plain-English reason; unknowns score low and say so instead of guessing.

export type FitFactor = "theme" | "local" | "student_history" | "value" | "timeline" | "evidence" | "relationship";
export type Weights = Record<FitFactor, number>;
export const DEFAULT_WEIGHTS: Weights = { theme: 25, local: 15, student_history: 15, value: 15, timeline: 10, evidence: 10, relationship: 10 };
export const FACTOR_LABEL: Record<FitFactor, string> = {
  theme: "Theme relevance",
  local: "Local / campus relevance",
  student_history: "Public student-event history",
  value: "Contribution type & value",
  timeline: "Timeline fit",
  evidence: "Evidence freshness & confidence",
  relationship: "Our history with them",
};

export type FitInput = {
  company: { industry: string | null; city: string | null; notes: string | null; contribution_types: string[]; est_value: number | null };
  sources: { claim: string; kind: string; source_date: string | null; confidence: "high" | "medium" | "low" }[];
  /** What we recorded ourselves across past events — never web data. */
  ours: { confirmed: number; declined: number; pitched: number; paidLate: number };
  event: { theme: string; date: string | null; budget: number } | null;
  campusCity: string;
  today: string;
};

const CONF = { high: 1, medium: 0.6, low: 0.3 } as const;
const STOP = new Set(["and", "for", "the", "with", "event", "events", "student", "students", "college", "campus", "on", "of", "a", "in", "to", "tech"]);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 2 && !STOP.has(w)));
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export function fitScore(x: FitInput, w: Weights = DEFAULT_WEIGHTS) {
  const f: Record<FitFactor, { score: number; why: string }> = {} as never;

  // Theme: overlap between the event's theme and what we know about the company (industry, notes, sourced claims).
  if (!x.event) f.theme = { score: 0, why: "Pick an event to score theme relevance." };
  else {
    const ev = words(x.event.theme);
    const co = words([x.company.industry, x.company.notes, ...x.sources.map((s) => s.claim)].filter(Boolean).join(" "));
    const hits = [...ev].filter((t) => co.has(t));
    f.theme = hits.length
      ? { score: Math.min(1, hits.length / Math.max(2, Math.min(4, ev.size))), why: `Shares "${hits.slice(0, 3).join(", ")}" with the event theme.` }
      : { score: 0, why: "Nothing recorded about them matches this event's theme." };
  }

  // Local: same city as the campus, elsewhere, or unknown (unknown is not assumed local).
  const city = x.company.city?.trim();
  f.local = !city
    ? { score: 0, why: "No city recorded." }
    : city.toLowerCase() === x.campusCity.toLowerCase()
      ? { score: 1, why: `Based in ${city}, same as the campus.` }
      : { score: 0.4, why: `Based in ${city}, not ${x.campusCity}.` };

  // Student-event history: only sourced claims count, weighted by their confidence.
  const hist = x.sources.filter((s) => s.kind === "history");
  const best = Math.max(0, ...hist.map((s) => CONF[s.confidence]));
  f.student_history = hist.length
    ? { score: Math.min(1, best + 0.15 * (hist.length - 1)), why: `${hist.length} sourced student-event sponsorship${hist.length > 1 ? "s" : ""} (best confidence: ${hist.find((s) => CONF[s.confidence] === best)!.confidence}).` }
    : { score: 0, why: "No sourced history of sponsoring student events." };

  // Value: estimated value against a typical Gold ask (25% of budget); non-cash types add a little.
  const target = Math.max(5000, (x.event?.budget ?? 40000) * 0.25);
  const est = x.company.est_value ?? 0;
  const kinds = x.company.contribution_types;
  f.value = !est && !kinds.length
    ? { score: 0, why: "No contribution type or value recorded." }
    : { score: Math.min(1, est / target + 0.1 * kinds.filter((k) => k !== "cash").length), why: `${est ? `~₹${est.toLocaleString("en-IN")} estimated` : "No estimate"}${kinds.length ? ` · offers ${kinds.join(", ")}` : ""}.` };

  // Timeline: companies need lead time to approve budgets.
  if (!x.event?.date) f.timeline = { score: 0.5, why: "Event date not set." };
  else {
    const d = days(x.event.date, x.today);
    f.timeline = d < 0 ? { score: 0, why: "Event is over." } : d >= 45 ? { score: 1, why: `${d} days of lead time.` } : d >= 21 ? { score: 0.7, why: `${d} days — tight but workable.` } : d >= 10 ? { score: 0.4, why: `Only ${d} days left.` } : { score: 0.1, why: `${d} days — likely too late.` };
  }

  // Evidence: how fresh and how confident our sources are.
  const dated = x.sources.filter((s) => s.source_date);
  if (!x.sources.length) f.evidence = { score: 0, why: "No sources recorded." };
  else {
    const age = dated.length ? Math.min(...dated.map((s) => days(x.today, s.source_date!))) : Infinity;
    const fresh = age <= 180 ? 1 : age <= 365 ? 0.6 : age === Infinity ? 0.2 : 0.3;
    const conf = x.sources.reduce((s, y) => s + CONF[y.confidence], 0) / x.sources.length;
    f.evidence = { score: fresh * conf, why: `${x.sources.length} source${x.sources.length > 1 ? "s" : ""}, newest ${age === Infinity ? "undated" : `${age} days old`}, average confidence ${conf >= 0.8 ? "high" : conf >= 0.5 ? "medium" : "low"}.` };
  }

  // Relationship: only our own records — confirmed deals, declines, payments.
  const o = x.ours;
  f.relationship = o.confirmed
    ? { score: Math.max(0.2, Math.min(1, 0.5 + 0.25 * o.confirmed) - 0.25 * o.paidLate), why: `Partnered with us ${o.confirmed} time${o.confirmed > 1 ? "s" : ""}${o.paidLate ? `, ${o.paidLate} payment${o.paidLate > 1 ? "s" : ""} late or disputed` : ""}.` }
    : o.declined
      ? { score: 0.2, why: `Declined ${o.declined} time${o.declined > 1 ? "s" : ""} before.` }
      : { score: 0.3, why: o.pitched ? "Pitched before, no answer yet." : "No history with us yet." };

  const total = Object.values(w).reduce((s, v) => s + v, 0) || 1;
  const factors = (Object.keys(FACTOR_LABEL) as FitFactor[]).map((k) => ({ key: k, label: FACTOR_LABEL[k], weight: w[k], ...f[k], points: (f[k].score * w[k] * 100) / total }));
  return { score: Math.round(factors.reduce((s, y) => s + y.points, 0)), factors };
}

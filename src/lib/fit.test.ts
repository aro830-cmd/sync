// Run: node src/lib/fit.test.ts
import assert from "node:assert/strict";
import { DEFAULT_WEIGHTS, fitScore, type FitInput } from "./fit.ts";

const base: FitInput = {
  company: { industry: "Cloud infrastructure", city: "Bengaluru", notes: "Developer credits for hackathons", contribution_types: ["cash", "credits"], est_value: 15000 },
  sources: [{ claim: "Sponsored a student hackathon at RVCE", kind: "history", source_date: "2026-10-01", confidence: "high" }],
  ours: { confirmed: 2, declined: 0, pitched: 2, paidLate: 0 },
  event: { theme: "Cloud hackathon for campus", date: "2027-01-24", budget: 60000 },
  campusCity: "Bengaluru",
  today: "2026-11-26",
};

const good = fitScore(base);
assert.ok(good.score >= 80, `strong fit should score high, got ${good.score}`);
assert.equal(good.factors.length, 7);
// Points add up to the score; every factor explains itself.
assert.equal(Math.round(good.factors.reduce((s, f) => s + f.points, 0)), good.score);
assert.ok(good.factors.every((f) => f.why.length > 5));

// Unknowns are not guessed: no city, no sources, no history → those factors are 0/low and say why.
const blank = fitScore({ ...base, company: { industry: null, city: null, notes: null, contribution_types: [], est_value: null }, sources: [], ours: { confirmed: 0, declined: 0, pitched: 0, paidLate: 0 } });
const by = Object.fromEntries(blank.factors.map((f) => [f.key, f]));
assert.equal(by.local.score, 0);
assert.match(by.local.why, /No city/);
assert.equal(by.student_history.score, 0);
assert.equal(by.evidence.score, 0);
assert.ok(blank.score < 25, `unknown company should score low, got ${blank.score}`);

// Payment problems come only from our records and lower the relationship factor.
const late = fitScore({ ...base, ours: { ...base.ours, paidLate: 2 } });
assert.ok(late.factors.find((f) => f.key === "relationship")!.score < good.factors.find((f) => f.key === "relationship")!.score);

// Weights are configurable: zeroing theme removes its contribution.
const noTheme = fitScore(base, { ...DEFAULT_WEIGHTS, theme: 0 });
assert.equal(noTheme.factors.find((f) => f.key === "theme")!.points, 0);

// Late events score low on timeline.
const rushed = fitScore({ ...base, event: { ...base.event!, date: "2026-12-01" } });
assert.ok(rushed.factors.find((f) => f.key === "timeline")!.score <= 0.1);

console.log("fit ok");

// Run: node src/lib/offline.test.ts
import assert from "node:assert/strict";
import { offlinePlan, offlineSuggestions, parseBrief } from "./offline.ts";

const today = "2026-11-26";

// Budget, headcount, date and type come out of a typical brief.
let p = parseBrief("Hackathon on AI for campus, 15 Dec, ₹50k, 200 people", today);
assert.equal(p.budget, 50000);
assert.equal(p.people, 200);
assert.equal(p.date, "2026-12-15");
assert.equal(p.type, "Hackathon");
assert.equal(p.free, false);

// Ordinal + "of", rupees with commas, a date earlier in the year rolls to next year.
p = parseBrief("I want to plan a hackathon which is on 5th of December. Prize pool ₹50,000, 120 students", today);
assert.equal(p.date, "2026-12-05");
assert.equal(p.budget, 50000);
p = parseBrief("Tech talk on cloud careers, 10 Jan, ₹15k, 80 people", today);
assert.equal(p.date, "2027-01-10");
assert.equal(p.budget, 15000);

// Seminars / free events have no budget.
p = parseBrief("Free seminar on AI safety, 18 Dec, 120 students", today);
assert.equal(p.free, true);
assert.equal(p.budget, 0);

// The plan is internally consistent: split sums to the budget, free events get no tiers.
const plan = offlinePlan("Hackathon on AI for campus, 15 Dec, ₹50k, 200 people", today);
assert.equal(plan.budget_split.reduce((s, b) => s + b.amount, 0), 50000);
assert.equal(plan.tiers.length, 4);
assert.equal(plan.timeline.at(-1)!.date, "2026-12-15");
assert.match(plan.name, /Hackathon 2026/);
const free = offlinePlan("Free seminar on AI safety, 18 Dec, 120 students", today);
assert.equal(free.kind, "free");
assert.deepEqual(free.tiers, []);

// Suggestions skip companies already approached and favour theme matches.
const s = offlineSuggestions("Hackathon on fintech payments", ["Title", "Gold", "Silver"], new Set(["github"]));
assert.equal(s.length, 8);
assert.ok(!s.some((x) => x.company === "GitHub"));
assert.equal(s[0].company, "Razorpay");

console.log("offline ok");

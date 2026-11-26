// Run: node src/lib/vcache.test.ts
import assert from "node:assert/strict";
import { THRESHOLD, cosine, embed, facts } from "./vcache.ts";

const a = "You are the Planner agent. Brief: Hackathon on AI for campus, 15 Dec, ₹50k, 200 people";
// Same prompt → identical vector; reworded slightly → still above the bar.
assert.ok(cosine(embed(a), embed(a)) > 0.999);
assert.ok(cosine(embed(a), embed(a.replace("for campus", "for the campus"))) >= THRESHOLD);
// Different topic → well below.
assert.ok(cosine(embed(a), embed("Write a reminder email for registered attendees of a seminar")) < THRESHOLD);
// Different numbers or names → facts differ, so the answer is never shared even if wording is near-identical.
assert.notEqual(facts(a), facts(a.replace("₹50k", "₹60k")));
assert.notEqual(facts(a), facts(a.replace("AI", "Web3")));
assert.equal(facts(a), facts(a.replace("for campus", "for the campus")));
console.log("vcache ok");

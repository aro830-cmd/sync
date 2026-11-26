// Run: node src/lib/match.test.ts
import assert from "node:assert/strict";
import { availableFor, suggest, type MatchProfile, type MatchRole } from "./match.ts";

const date = "2026-12-15"; // a Tuesday
const role = (key: string, name: string, skills: string[], from = "09:00", to = "13:00"): MatchRole => ({ key, name, skills, from, to });
const p = (id: string, o: Partial<MatchProfile> = {}): MatchProfile => ({ id, name: id, skills: [], preferred_roles: [], availability: [], available: true, opted_in: true, learning_goals: null, ...o });

// Stated availability is respected: a slot that doesn't cover the role excludes the person.
const busy = p("busy", { availability: [{ date, from: "14:00", to: "18:00" }] });
assert.equal(availableFor(busy, date, "09:00", "13:00"), "no");
assert.equal(availableFor(p("weekly", { availability: [{ weekday: 2, from: "08:00", to: "20:00" }] }), date, "09:00", "13:00"), "yes");
assert.equal(availableFor(p("blank"), date, "09:00", "13:00"), "unstated");

// Preference + skill win, and the reason says why in plain words.
const roles = [role("check_in_lead", "Check-in lead", ["registration"], "07:30", "11:00"), role("community_storyteller", "Community storyteller", ["social"])];
let s = suggest(roles, [p("ana", { preferred_roles: ["check_in_lead"], skills: ["registration"] }), p("bo", { skills: ["social"] }), busy], {}, date);
assert.equal(s[0].profileId, "ana");
assert.match(s[0].reason, /they chose Check-in lead/);
assert.match(s[0].reason, /registration skills/);
assert.equal(s[1].profileId, "bo");

// Nobody gets two roles at one event.
s = suggest(roles, [p("solo", { skills: ["registration", "social"] })], {}, date);
assert.equal(s.filter((x) => x.profileId === "solo").length, 1);
assert.equal(s.filter((x) => x.profileId === null).length, 1);

// Opted-out or marked-away volunteers are never suggested.
s = suggest([roles[1]], [p("out", { opted_in: false, skills: ["social"] }), p("away", { available: false, skills: ["social"] })], {}, date);
assert.equal(s[0].profileId, null);

// Fairness: equal fit → the person with fewer recent roles is picked; unpopular roles rotate.
const twins = [p("x", { skills: ["registration"] }), p("y", { skills: ["registration"] })];
s = suggest([roles[0]], twins, { x: { recent: 3, unpopular: 2 }, y: { recent: 0, unpopular: 0 } }, date);
assert.equal(s[0].profileId, "y");
assert.match(s[0].reason, /their turn/);

// Deterministic: same input, same output.
assert.deepEqual(suggest(roles, twins, {}, date), suggest(roles, twins, {}, date));

console.log("match ok");

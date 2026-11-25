// Run: node src/lib/schedule.test.ts
import assert from "node:assert/strict";
import { assign } from "./schedule.ts";

const t = (title: string, from: string, to: string, skill?: string) => ({
  title,
  skill,
  starts_at: `2026-12-15T${from}:00Z`,
  ends_at: `2026-12-15T${to}:00Z`,
});

// Skill match wins; overlapping tasks never share a volunteer.
const r = assign(
  [t("Registration desk", "09:00", "11:00"), t("Stage AV", "09:30", "10:30", "av"), t("Lunch", "10:00", "12:00")],
  [{ id: "a", skills: "AV, design" }, { id: "b", skills: "" }, { id: "c" }],
);
assert.equal(r[1], "a");
assert.equal(new Set(r).size, 3);

// More overlapping tasks than people → extras stay unassigned, not double-booked.
const r2 = assign([t("x", "09:00", "10:00"), t("y", "09:00", "10:00")], [{ id: "a" }]);
assert.deepEqual(r2, ["a", null]);

// Back-to-back is not a clash.
assert.deepEqual(assign([t("x", "09:00", "10:00"), t("y", "10:00", "11:00")], [{ id: "a" }]), ["a", "a"]);

console.log("schedule ok");

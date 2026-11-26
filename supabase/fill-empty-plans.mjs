// Fills events whose Planner never finished (e.g. Gemini quota) with the app's own offline plan — the same mock data
// the Planner agent produces when Gemini is down. Only touches events with no plan; safe to re-run.
// Run: node --env-file=.env.local supabase/fill-empty-plans.mjs
import { createClient } from "@supabase/supabase-js";
import { offlinePlan } from "../src/lib/offline.ts";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const today = new Date().toISOString().slice(0, 10);
const inr = (n) => `₹${n.toLocaleString("en-IN")}`;

const { data: empty, error } = await db.from("events").select("id, brief, plan").or("plan.is.null,name.is.null");
if (error) throw new Error(error.message);

for (const ev of empty) {
  if (ev.plan?.timeline?.length) continue;
  const p = offlinePlan(ev.brief, today);
  const free = p.kind === "free";
  const { error: e1 } = await db.from("events").update({
    name: p.name, theme: p.theme, date: p.date, budget: free ? 0 : p.budget, expected_attendees: p.expected_attendees, venue: p.venue,
    plan: { ...ev.plan, kind: p.kind, budget_split: free ? [] : p.budget_split, tiers: free ? [] : p.tiers, timeline: p.timeline },
  }).eq("id", ev.id);
  if (e1) throw new Error(e1.message);
  // Same run log and decision record the Planner agent writes, so the desk shows it as done with a "Why?".
  const summary = (free ? `Planned ${p.name}: free event, ${p.timeline.length} milestones` : `Planned ${p.name}: ${inr(p.budget)} across ${p.budget_split.length} heads, ${p.tiers.length} sponsor tiers`) + " · offline mode";
  await db.from("agent_runs").insert({ event_id: ev.id, agent: "planner", summary, output: p, ok: true });
  const { data: dec } = await db.from("decisions").insert({
    event_id: ev.id, kind: "plan", subject_id: ev.id, subject: p.name, decided_by: "Planner (offline rules)",
    outcome: free ? "Planned as a free event — no budget, no sponsors" : `Planned as a funded event — ${inr(p.budget)}, ${p.tiers.length} sponsor tiers`,
    why: {
      rules: [
        { rule: "Budget given in the brief", ok: !free, detail: free ? "No amount in the brief" : "The brief names an amount" },
        { rule: "Event type read from the brief", ok: true, detail: `Brief: “${ev.brief}”` },
        { rule: "Gemini unavailable — offline template used", ok: true, detail: "Same structure as a Gemini plan, built from the brief" },
      ],
      scores: { budget: inr(free ? 0 : p.budget), expected: p.expected_attendees },
    },
  }).select("id").single();
  if (dec) await db.from("decision_log").insert({ decision_id: dec.id, event_id: ev.id, to_status: "auto", actor: "Planner (offline rules)", note: "Decided automatically" });
  console.log(`filled ${p.name} (${ev.id.slice(0, 8)})`);
}
console.log(`${empty.length} event(s) checked`);

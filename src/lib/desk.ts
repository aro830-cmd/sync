import "server-only";
import { connection } from "next/server";
import { db } from "@/lib/server";
import type { EventRow, Sponsor } from "@/lib/types";

/** One event with just enough of its children for cross-event views (home, past events, agent pages). */
export type DeskEvent = EventRow & {
  sponsors: Pick<Sponsor, "company" | "status" | "tier">[];
  attendees: { checked_in: boolean; certificate_sent: boolean; created_at: string }[];
  agent_runs: { agent: string; ok: boolean; summary: string; created_at: string }[];
  tasks: { volunteer_id: string | null }[];
};

export async function allEvents() {
  await connection(); // always fresh, and "upcoming vs past" depends on today
  const { data, error } = await db()
    .from("events")
    .select("*, sponsors(company, status, tier), attendees(checked_in, certificate_sent, created_at), agent_runs(agent, ok, summary, created_at), tasks(volunteer_id)")
    .order("date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const today = new Date().toISOString().slice(0, 10);
  const events = data as DeskEvent[];
  return {
    events,
    upcoming: events.filter((e) => !e.date || e.date >= today),
    past: events.filter((e) => e.date && e.date < today).reverse(),
    now: Date.now(),
  };
}

/** Money from confirmed sponsors, priced by the event's own tiers. */
export const raised = (e: DeskEvent) =>
  e.sponsors.filter((s) => s.status === "confirmed").reduce((sum, s) => sum + (e.plan?.tiers?.find((t) => t.name === s.tier)?.amount ?? 0), 0);
export const attended = (e: DeskEvent) => e.attendees.filter((a) => a.checked_in).length;

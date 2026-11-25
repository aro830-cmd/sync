import "server-only";
import { db } from "./server";
import { reportPdf } from "./pdf";

export async function reportStats(eventId: string) {
  const [att, spons] = await Promise.all([
    db().from("attendees").select("checked_in").eq("event_id", eventId),
    db().from("sponsors").select("company, tier, status").eq("event_id", eventId),
  ]);
  if (att.error || spons.error) throw new Error((att.error ?? spons.error)!.message);
  return {
    registered: att.data.length,
    attended: att.data.filter((a) => a.checked_in).length,
    confirmed: spons.data.filter((s) => s.status === "confirmed"),
  };
}

export async function buildReport(eventId: string) {
  const d = db();
  const [ev, att, spons, vols, tasks] = await Promise.all([
    d.from("events").select("*").eq("id", eventId).single(),
    d.from("attendees").select("checked_in, certificate_sent, created_at").eq("event_id", eventId).order("created_at"),
    d.from("sponsors").select("company, tier, status").eq("event_id", eventId),
    d.from("volunteers").select("id, name").eq("event_id", eventId),
    d.from("tasks").select("title, starts_at, ends_at, volunteer_id").eq("event_id", eventId).order("starts_at"),
  ]);
  const err = [ev, att, spons, vols, tasks].find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const e = ev.data, plan = e.plan ?? {};
  const [A, S, V, T] = [att.data!, spons.data!, vols.data!, tasks.data!];
  const tiers: { name: string; amount: number; perks: string[] }[] = plan.tiers ?? [];
  const amount = (tier: string | null) => tiers.find((t) => t.name === tier)?.amount ?? 0;

  // Registrations per day, from the first sign-up to the last (gaps included so the chart reads as time).
  const days = new Map<string, number>();
  for (const a of A) days.set(a.created_at.slice(0, 10), (days.get(a.created_at.slice(0, 10)) ?? 0) + 1);
  const keys = [...days.keys()].sort();
  const daily: { day: string; n: number }[] = [];
  if (keys.length) for (let t = Date.parse(keys[0]); t <= Date.parse(keys[keys.length - 1]); t += 86_400_000) {
    const k = new Date(t).toISOString().slice(0, 10);
    daily.push({ day: k, n: days.get(k) ?? 0 });
  }

  const st = (...x: string[]) => S.filter((s) => x.includes(s.status)).length;
  const who = new Map(V.map((v) => [v.id, v.name]));
  const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return reportPdf({
    event: e.name ?? "Event",
    theme: e.theme ?? "",
    date: e.date ?? "",
    venue: e.venue ?? "",
    free: plan.kind === "free",
    summary: e.summary ?? "Run the Reporting agent to write this summary.",
    expected: e.expected_attendees,
    budget: e.budget ?? 0,
    registered: A.length,
    attended: A.filter((a) => a.checked_in).length,
    certificates: A.filter((a) => a.certificate_sent).length,
    daily,
    budgetSplit: plan.budget_split ?? [],
    tiers,
    funnel: { leads: S.length, pitched: st("contacted", "replied", "confirmed", "declined"), replied: st("replied", "confirmed"), confirmed: st("confirmed"), declined: st("declined") },
    partners: S.filter((s) => s.status === "confirmed").map((s) => ({ company: s.company, tier: s.tier, amount: amount(s.tier) })).sort((a, b) => b.amount - a.amount),
    timeline: plan.timeline ?? [],
    volunteers: V.length,
    shifts: T.map((t) => ({ time: `${hm(t.starts_at)}-${hm(t.ends_at)}`, title: t.title, who: (t.volunteer_id && who.get(t.volunteer_id)) || "Unassigned" })),
    hours: T.reduce((s, t) => s + (Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 3_600_000, 0),
  });
}

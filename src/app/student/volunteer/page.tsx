import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { FoxMark } from "@/components/FoxMark";
import { VolunteerPortal, type PortalData } from "@/components/student/VolunteerPortal";
import { crmReady, db } from "@/lib/server";
import { currentStudent } from "@/lib/student";
import type { MissionRole, VolunteerProfile } from "@/lib/types";

export const metadata: Metadata = { title: "Volunteer — Relay" };

async function Portal() {
  await connection();
  const me = await currentStudent();
  if (!me) redirect("/student/login");
  if (!(await crmReady())) return <p className="text-[15px] text-ink-2">Volunteering opens once the club finishes its database update. Check back soon.</p>;

  const today = new Date().toISOString().slice(0, 10);
  const d = db();
  const profile = (await d.from("volunteer_profiles").select("*").eq("email", me.email).maybeSingle()).data as VolunteerProfile | null;
  const [roles, events, filled, mine, feedback, rewards, myVols] = await Promise.all([
    d.from("roles").select("*").order("sort"),
    d.from("events").select("id, name, date, venue, plan").not("name", "is", null).gte("date", today).order("date").limit(10),
    d.from("role_requests").select("event_id, role_key").in("status", ["accepted", "completed"]),
    profile ? d.from("role_requests").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    profile ? d.from("volunteer_feedback").select("kind, note, event_id, corrected, created_at").eq("profile_id", profile.id).eq("visible_to_volunteer", true).eq("corrected", false) : Promise.resolve({ data: [] }),
    profile ? d.from("rewards").select("kind, status, event_id").eq("profile_id", profile.id) : Promise.resolve({ data: [] }),
    d.from("volunteers").select("id, event_id").eq("email", me.email).not("event_id", "is", null),
  ]);
  const vIds = (myVols.data ?? []).map((v) => v.id);
  const shifts = vIds.length ? (await d.from("tasks").select("title, starts_at, ends_at, volunteer_id").in("volunteer_id", vIds).order("starts_at")).data ?? [] : [];
  const evName = new Map<string, string>();
  for (const e of (await d.from("events").select("id, name")).data ?? []) evName.set(e.id, e.name ?? "Event");
  const vEvent = new Map((myVols.data ?? []).map((v) => [v.id, v.event_id as string]));

  const data: PortalData = {
    name: me.name,
    profile,
    roles: (roles.data ?? []) as MissionRole[],
    events: (events.data ?? []).map((e) => ({ id: e.id, name: e.name!, date: e.date, venue: e.venue })),
    filled: (filled.data ?? []).map((f) => `${f.event_id}:${f.role_key}`),
    requests: (mine.data ?? []).map((r: { id: string; event_id: string; role_key: string; status: string; reason: string | null }) => ({ ...r, event: evName.get(r.event_id) ?? "Event" })),
    shifts: shifts.map((t) => ({ title: t.title, starts_at: t.starts_at, ends_at: t.ends_at, event: evName.get(vEvent.get(t.volunteer_id!) ?? "") ?? "Event" })),
    feedback: (feedback.data ?? []).map((f: { kind: string; note: string | null; event_id: string | null }) => ({ kind: f.kind, note: f.note, event: f.event_id ? evName.get(f.event_id) ?? null : null })),
    rewards: (rewards.data ?? []).map((r: { kind: string; status: string; event_id: string | null }) => ({ kind: r.kind, status: r.status, event: r.event_id ? evName.get(r.event_id) ?? null : null })),
  };
  return <VolunteerPortal d={data} />;
}

export default function Page() {
  return (
    <main className="grain min-h-screen px-6 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 font-[family-name:var(--font-archivo)] text-2xl font-semibold tracking-[-0.02em]"><FoxMark className="size-9 rounded-[11px]" />Relay<sup className="text-[.45em] text-signal">®</sup></Link>
          <Link href="/student" className="text-[14px] text-ink-2 hover:text-ink">← My events</Link>
        </div>
        <div className="mt-14">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-paper-2/50" />}>
            <Portal />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

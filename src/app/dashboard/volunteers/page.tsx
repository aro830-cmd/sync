import { Suspense } from "react";
import { connection } from "next/server";
import { crmReady, db } from "@/lib/server";
import type { MissionRole, VolunteerProfile } from "@/lib/types";
import { Profiles, type FeedbackRow, type RewardRow } from "@/components/desk/Profiles";
import { ROLES, parseSkills } from "@/lib/roster";
import { BarList } from "@/components/desk/charts";
import { CountUp } from "@/components/desk/fx";
import { homeNav } from "@/components/desk/nav";
import { Roster, type Member } from "@/components/desk/Roster";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Card } from "@/components/desk/ui";

/** After migration 002: opt-in profiles, mission roles, feedback and the reward tracker. */
async function ProfilesPage() {
  const d = db();
  const [profiles, roles, feedback, rewards, done, events] = await Promise.all([
    d.from("volunteer_profiles").select("*").order("name"),
    d.from("roles").select("*").order("sort"),
    d.from("volunteer_feedback").select("*").order("created_at", { ascending: false }),
    d.from("rewards").select("*").order("created_at", { ascending: false }),
    d.from("role_requests").select("profile_id").eq("status", "completed"),
    d.from("events").select("id, name"),
  ]);
  const err = [profiles, roles, feedback, rewards, done, events].find((r) => r.error)?.error;
  if (err) return <SetupNotice message={err.message} />;
  const ev = new Map(events.data!.map((e) => [e.id, e.name as string | null]));
  const who = new Map(profiles.data!.map((p) => [p.id, p.name as string]));
  const completed: Record<string, number> = {};
  for (const r of done.data!) completed[r.profile_id] = (completed[r.profile_id] ?? 0) + 1;
  return (
    <>
      <div className="mb-8">
        <div className="text-[12.5px] text-d-ink3">Volunteers</div>
        <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Volunteers & roles</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">Profiles are opt-in and filled in by volunteers themselves. Matching uses only skills, chosen roles, availability and goals — never personal attributes — and every suggestion explains itself on the event&apos;s Logistics page.</p>
      </div>
      <Profiles
        profiles={profiles.data as VolunteerProfile[]}
        roles={roles.data as MissionRole[]}
        feedback={(feedback.data ?? []).map((f) => ({ ...f, event: f.event_id ? ev.get(f.event_id) ?? null : null })) as FeedbackRow[]}
        rewards={(rewards.data ?? []).map((r) => ({ ...r, name: who.get(r.profile_id) ?? "Volunteer", event: r.event_id ? ev.get(r.event_id) ?? null : null })) as RewardRow[]}
        completed={completed}
      />
    </>
  );
}

async function Page() {
  await connection();
  if (await crmReady()) return <ProfilesPage />;
  let members: Member[];
  try {
    const d = db();
    const [roster, served, tasks, events] = await Promise.all([
      d.from("volunteers").select("id, name, email, skills").is("event_id", null).order("name"),
      d.from("volunteers").select("id, email, event_id").not("event_id", "is", null),
      d.from("tasks").select("volunteer_id, starts_at, ends_at").not("volunteer_id", "is", null),
      d.from("events").select("id, name, date"),
    ]);
    const err = [roster, served, tasks, events].find((r) => r.error)?.error;
    if (err) throw new Error(err.message);

    // History comes from the per-event volunteer rows with the same email.
    const ev = new Map(events.data!.map((e) => [e.id, e]));
    const hours = new Map<string, number>();
    for (const t of tasks.data!) hours.set(t.volunteer_id!, (hours.get(t.volunteer_id!) ?? 0) + (Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 3_600_000);
    members = roster.data!.map((m) => {
      const rows = served.data!.filter((s) => s.email === m.email);
      const past = rows.map((r) => ev.get(r.event_id!)).filter(Boolean).sort((a, b) => (b!.date ?? "").localeCompare(a!.date ?? ""));
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        ...parseSkills(m.skills),
        events: new Set(rows.map((r) => r.event_id)).size,
        hours: rows.reduce((s, r) => s + (hours.get(r.id) ?? 0), 0),
        last: past[0]?.name ?? null,
      };
    });
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }

  const available = members.filter((m) => m.available).length;
  const totalHours = members.reduce((s, m) => s + m.hours, 0);
  const cover = ROLES.map((r) => ({ label: r.role, value: members.filter((m) => m.available && m.skills.includes(r.skill)).length }));

  return (
    <>
      <div className="mb-8">
        <div className="text-[12.5px] text-d-ink3">Club volunteer roster</div>
        <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Volunteers</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">Club members who are ready to help. Mark who&apos;s available and which roles they like — the Logistics agent staffs each event from this list and gives everyone a role and clash-free shifts.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Members", members.length, "bg-s1", "on the roster"],
          ["Available now", available, "bg-good", `${members.length - available} away`],
          ["Hours given", Math.round(totalHours), "bg-s4", "across all events"],
          ["Roles covered", cover.filter((c) => c.value).length, "bg-s2", `of ${ROLES.length} roles have someone available`],
        ].map(([l, v, dot, hint]) => (
          <div key={l as string} className="rounded-2xl border border-d-line bg-d-panel p-5">
            <div className="flex items-center gap-2 text-[12.5px] text-d-ink2"><span className={`size-2 rounded-full ${dot}`} />{l}</div>
            <div className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.02em]"><CountUp value={v as number} /></div>
            <div className="mt-2 text-[12px] text-d-ink3">{hint}</div>
          </div>
        ))}
      </div>

      <Card title="Who can cover what" sub="Available members per role" className="mt-3">
        <BarList rows={cover} color="bg-s3" />
      </Card>

      <div className="mt-3">
        <Roster members={members} />
      </div>
    </>
  );
}

export default function VolunteersPage() {
  return (
    <Shell groups={homeNav("volunteers")}>
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <Page />
      </Suspense>
    </Shell>
  );
}

// Fair, explainable volunteer-to-role matching. Pure (no imports) so `node src/lib/match.test.ts` runs it.
// Uses only what volunteers told us (skills, preferred roles, availability, learning goals) and our own load history.
// Never uses sensitive attributes or proxies (gender, religion, caste, college, "culture fit").

export type MatchRole = { key: string; name: string; skills: string[]; from: string; to: string };
export type MatchProfile = {
  id: string;
  name: string;
  skills: string[];
  preferred_roles: string[];
  availability: { date?: string; weekday?: number; from: string; to: string }[];
  available: boolean;
  opted_in: boolean;
  learning_goals: string | null;
};
/** Our own records only: how many roles they've done recently and how many of those were unpopular. */
export type Load = { recent: number; unpopular: number };
export type Suggestion = { roleKey: string; profileId: string | null; reason: string; alternatives: string[] };

/** Roles most people avoid (early starts, cleanup). Shared out in turn instead of landing on the same people. */
export const UNPOPULAR = new Set(["check_in_lead", "sustainability_lead", "demo_floor_captain"]);

/** Default time windows per mission role on event day (24h "HH:MM"). */
export const ROLE_WINDOWS: Record<string, [string, string]> = {
  check_in_lead: ["07:30", "11:00"],
  hacker_concierge: ["09:00", "14:00"],
  sponsor_liaison: ["09:00", "15:00"],
  mentor_coordinator: ["10:00", "15:00"],
  community_storyteller: ["09:00", "15:00"],
  accessibility_ambassador: ["08:00", "13:00"],
  livestream_producer: ["09:00", "15:00"],
  demo_floor_captain: ["15:00", "19:00"],
  sustainability_lead: ["16:00", "20:00"],
};

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Covered by a stated slot on that date (or that weekday)? No slots at all = not stated, which is different from "no". */
export function availableFor(p: MatchProfile, date: string, from: string, to: string): "yes" | "no" | "unstated" {
  if (!p.availability.length) return "unstated";
  return p.availability.some((s) => (s.date ? s.date === date : s.weekday === weekday(date)) && s.from <= from && s.to >= to) ? "yes" : "no";
}

export function suggest(roles: MatchRole[], profiles: MatchProfile[], load: Record<string, Load>, date: string, taken: Set<string> = new Set()): Suggestion[] {
  const pool = profiles.filter((p) => p.opted_in && p.available);
  const avg = pool.length ? pool.reduce((s, p) => s + (load[p.id]?.recent ?? 0), 0) / pool.length : 0;

  const scored = roles.map((r) => {
    const cands = pool
      .map((p) => {
        const avail = availableFor(p, date, r.from, r.to);
        if (avail === "no") return null; // respect stated availability, always
        const prefers = p.preferred_roles.includes(r.key);
        const skills = r.skills.filter((s) => p.skills.includes(s));
        const goal = !!p.learning_goals && r.name.toLowerCase().split(/\W+/).some((w) => w.length > 3 && p.learning_goals!.toLowerCase().includes(w));
        const l = load[p.id] ?? { recent: 0, unpopular: 0 };
        const unpop = UNPOPULAR.has(r.key);
        const score = (prefers ? 3 : 0) + skills.length + (goal ? 1 : 0) + (avail === "yes" ? 0.5 : 0) - 0.75 * l.recent - (unpop ? 1.25 * l.unpopular : 0);
        return { p, score, prefers, skills, goal, avail, l, unpop };
      })
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => b.score - a.score || a.l.recent - b.l.recent || a.p.name.localeCompare(b.p.name));
    return { r, cands };
  });

  // Fill the hardest roles first (fewest candidates), one role per person per event.
  const used = new Set(taken);
  const out = new Map<string, Suggestion>();
  for (const { r, cands } of [...scored].sort((a, b) => a.cands.length - b.cands.length)) {
    const pick = cands.find((c) => !used.has(c.p.id));
    if (!pick) {
      out.set(r.key, { roleKey: r.key, profileId: null, reason: cands.length ? "Everyone who fits already has a role at this event." : "No opted-in volunteer is available for this time.", alternatives: [] });
      continue;
    }
    used.add(pick.p.id);
    const why: string[] = [];
    if (pick.prefers) why.push(`they chose ${r.name}`);
    if (pick.skills.length) why.push(`they have ${pick.skills.join(" and ")} skills`);
    if (pick.goal) why.push("it matches their learning goal");
    why.push(pick.avail === "yes" ? `they're available ${r.from}–${r.to}` : "they haven't set availability yet — confirm the time with them");
    if (pick.l.recent < avg) why.push(`they've had fewer recent roles (${pick.l.recent}) than average`);
    if (pick.unpop && !pick.l.unpopular) why.push("it's their turn for an early/cleanup role");
    out.set(r.key, { roleKey: r.key, profileId: pick.p.id, reason: `Suggested because ${why.join(", ")}.`, alternatives: cands.filter((c) => c.p.id !== pick.p.id).slice(0, 3).map((c) => c.p.id) });
  }
  return roles.map((r) => out.get(r.key)!);
}

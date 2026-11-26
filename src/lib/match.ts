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
/** Structured explanation for the Why? panel: each rule checked, everyone considered, the scores. */
export type MatchWhy = {
  rules: { rule: string; ok: boolean; detail: string }[];
  considered: { id: string; name: string; verdict: string; detail: string; load: number }[];
  scores: Record<string, number | string>;
};
export type Suggestion = { roleKey: string; profileId: string | null; reason: string; alternatives: string[]; why: MatchWhy };

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
  // Everyone the matcher looked at for a role, best first, with the real reason they weren't picked.
  type Cand = (typeof scored)[number]["cands"][number];
  const considered = (r: MatchRole, cands: Cand[], chosen: string | null) => [
    ...cands.map((c) => ({
      id: c.p.id, name: c.p.name, load: c.l.recent,
      verdict: c.p.id === chosen ? "chosen" : used.has(c.p.id) && c.p.id !== chosen ? "has a role" : "lower score",
      detail: `score ${c.score.toFixed(2)}${c.prefers ? " · chose it" : ""}${c.skills.length ? ` · ${c.skills.join(", ")}` : ""}`,
    })),
    ...profiles
      .filter((p) => !cands.some((c) => c.p.id === p.id))
      .map((p) => ({ id: p.id, name: p.name, load: load[p.id]?.recent ?? 0, verdict: "excluded", detail: !p.opted_in ? "Opted out" : !p.available ? "Marked away" : `Not available ${r.from}–${r.to}` })),
  ];
  const out = new Map<string, Suggestion>();
  for (const { r, cands } of [...scored].sort((a, b) => a.cands.length - b.cands.length)) {
    const pick = cands.find((c) => !used.has(c.p.id));
    if (!pick) {
      out.set(r.key, {
        roleKey: r.key, profileId: null, alternatives: [],
        reason: cands.length ? "Everyone who fits already has a role at this event." : "No opted-in volunteer is available for this time.",
        why: { rules: [{ rule: "Someone free who fits", ok: false, detail: cands.length ? "Everyone who fits already has a role at this event" : "No opted-in volunteer is available for this time" }], considered: considered(r, cands, null), scores: {} },
      });
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
    out.set(r.key, {
      roleKey: r.key,
      profileId: pick.p.id,
      reason: `Suggested because ${why.join(", ")}.`,
      alternatives: cands.filter((c) => c.p.id !== pick.p.id).slice(0, 3).map((c) => c.p.id),
      why: {
        rules: [
          { rule: "Respects stated availability", ok: true, detail: pick.avail === "yes" ? `Available ${r.from}–${r.to}` : "No availability set yet — confirm the time with them" },
          { rule: "Chose this role", ok: pick.prefers, detail: pick.prefers ? `${r.name} is in their preferred roles` : "Not in their preferred roles" },
          { rule: `Has the role's skills (${r.skills.join(", ") || "none needed"})`, ok: !r.skills.length || pick.skills.length > 0, detail: pick.skills.length ? `Matches ${pick.skills.join(", ")}` : "No matching skill" },
          { rule: "Matches a learning goal", ok: pick.goal, detail: pick.goal ? "Their learning goal mentions this kind of work" : "No matching learning goal" },
          { rule: "Shares the load fairly", ok: pick.l.recent <= avg, detail: `${pick.l.recent} recent role${pick.l.recent === 1 ? "" : "s"} vs team average ${avg.toFixed(1)}` },
          ...(pick.unpop ? [{ rule: "Early/cleanup roles rotate", ok: !pick.l.unpopular, detail: pick.l.unpopular ? `Has done ${pick.l.unpopular} recently` : "Their turn — none done recently" }] : []),
          { rule: "One role per person per event", ok: true, detail: "Hardest-to-fill roles are matched first" },
          { rule: "No sensitive attributes", ok: true, detail: "Only skills, preferences, availability, goals and our own load history" },
        ],
        considered: considered(r, cands, pick.p.id),
        scores: { score: Number(pick.score.toFixed(2)), "recent roles": pick.l.recent, "team avg": Number(avg.toFixed(1)) },
      },
    });
  }
  return roles.map((r) => out.get(r.key)!);
}

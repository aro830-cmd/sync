// Pure, deterministic volunteer assignment. The LLM proposes tasks; this guarantees no clashes.

export type Slot = { title: string; skill?: string | null; starts_at: string; ends_at: string };
export type Vol = { id: string; name?: string; skills?: string | null };

/** Why one assignment came out the way it did, captured at the moment it was made. */
export type Rule = { rule: string; ok: boolean; detail: string };
export type Considered = { id: string; name: string; verdict: "chosen" | "busy" | "no skill" | "busier"; detail: string; load: number };
export type Why = { rules: Rule[]; considered: Considered[] };

const overlaps = (a: Slot, b: Slot) =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);

/** Returns volunteer id (or null if nobody is free) per task, in input order. `booked` = shifts people already hold. */
export function assign(tasks: Slot[], vols: Vol[], booked: (Slot & { volunteer_id: string | null })[] = []): (string | null)[] {
  return assignExplained(tasks, vols, booked).who;
}

/** Same as assign(), plus the rules, constraints and loads behind each pick. */
export function assignExplained(tasks: Slot[], vols: Vol[], booked: (Slot & { volunteer_id: string | null })[] = []) {
  const taken = new Map<string, Slot[]>(vols.map((v) => [v.id, []]));
  for (const b of booked) if (b.volunteer_id) taken.get(b.volunteer_id)?.push(b);
  // Skill-specific tasks pick first so generic ones don't use up the only specialist.
  const order = tasks
    .map((_, i) => i)
    .sort((a, b) => Number(!tasks[a].skill) - Number(!tasks[b].skill) || Date.parse(tasks[a].starts_at) - Date.parse(tasks[b].starts_at));
  const who: (string | null)[] = tasks.map(() => null);
  const why: Why[] = tasks.map(() => ({ rules: [], considered: [] }));
  const nm = (v: Vol) => v.name ?? v.id;

  for (const i of order) {
    const t = tasks[i];
    const clash = (v: Vol) => taken.get(v.id)!.find((s) => overlaps(s, t));
    const free = vols.filter((v) => !clash(v));
    const skill = t.skill?.toLowerCase().trim();
    const has = (v: Vol) => !!skill && !!v.skills?.toLowerCase().includes(skill);
    const skilled = skill ? free.filter(has) : [];
    const pool = skilled.length ? skilled : free;
    const load = (v: Vol) => taken.get(v.id)!.length;
    const pick = pool.length ? pool.reduce((a, b) => (load(b) < load(a) ? b : a)) : null;

    why[i] = {
      considered: vols.map((v) => {
        const c = clash(v);
        const base = { id: v.id, name: nm(v), load: load(v) };
        if (pick && v.id === pick.id) return { ...base, verdict: "chosen" as const, detail: `Free, ${skill && has(v) ? `has “${skill}”, ` : ""}${load(v)} shift${load(v) === 1 ? "" : "s"} so far` };
        if (c) return { ...base, verdict: "busy" as const, detail: `Already on “${c.title}” at that time` };
        if (skilled.length && !has(v)) return { ...base, verdict: "no skill" as const, detail: `Doesn't list “${skill}”` };
        return { ...base, verdict: "busier" as const, detail: `${load(v)} shift${load(v) === 1 ? "" : "s"} vs ${pick ? load(pick) : 0} — load is balanced` };
      }),
      rules: [
        ...(skill
          ? [{ rule: `Task needs “${skill}”`, ok: !!pick && has(pick), detail: skilled.length ? `${skilled.length} free volunteer${skilled.length === 1 ? "" : "s"} with “${skill}”` : `Nobody free has “${skill}” — fell back to anyone free` }]
          : [{ rule: "Any skill accepted", ok: true, detail: "No special skill needed" }]),
        { rule: "Never double-book", ok: !!pick, detail: pick ? `${nm(pick)} has no overlapping shift (${vols.length - free.length} busy at this time)` : "Everyone is busy at this time — left open" },
        ...(pick ? [{ rule: "Balance the load", ok: true, detail: `${nm(pick)} had the fewest shifts (${load(pick)}) of the ${pool.length} eligible` }] : []),
      ],
    };
    if (!pick) continue;
    taken.get(pick.id)!.push(t);
    who[i] = pick.id;
  }
  return { who, why };
}

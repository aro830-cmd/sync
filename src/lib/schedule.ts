// Pure, deterministic volunteer assignment. The LLM proposes tasks; this guarantees no clashes.

export type Slot = { title: string; skill?: string | null; starts_at: string; ends_at: string };
export type Vol = { id: string; skills?: string | null };

const overlaps = (a: Slot, b: Slot) =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);

/** Returns volunteer id (or null if nobody is free) per task, in input order. */
export function assign(tasks: Slot[], vols: Vol[]): (string | null)[] {
  const taken = new Map<string, Slot[]>(vols.map((v) => [v.id, []]));
  // Skill-specific tasks pick first so generic ones don't use up the only specialist.
  const order = tasks
    .map((_, i) => i)
    .sort((a, b) => Number(!tasks[a].skill) - Number(!tasks[b].skill) || Date.parse(tasks[a].starts_at) - Date.parse(tasks[b].starts_at));
  const out: (string | null)[] = tasks.map(() => null);

  for (const i of order) {
    const t = tasks[i];
    const free = vols.filter((v) => !taken.get(v.id)!.some((s) => overlaps(s, t)));
    const skill = t.skill?.toLowerCase().trim();
    const skilled = skill ? free.filter((v) => v.skills?.toLowerCase().includes(skill)) : [];
    const pool = skilled.length ? skilled : free;
    if (!pool.length) continue;
    const pick = pool.reduce((a, b) => (taken.get(b.id)!.length < taken.get(a.id)!.length ? b : a));
    taken.get(pick.id)!.push(t);
    out[i] = pick.id;
  }
  return out;
}

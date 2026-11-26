// Club volunteer roster: volunteers rows with no event_id. Plain module (shared by server pages and client UI).
// `skills` holds comma-separated skills; the token "away" marks a member as not available right now.

export const ROLES: { skill: string; role: string }[] = [
  { skill: "registration", role: "Registration desk" },
  { skill: "av", role: "AV & stage" },
  { skill: "social", role: "Social media" },
  { skill: "design", role: "Design & photography" },
  { skill: "logistics", role: "Setup & logistics" },
  { skill: "tech", role: "Tech helpdesk" },
  { skill: "hospitality", role: "Speakers & guests" },
];

export function parseSkills(s: string | null) {
  const all = (s ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return { skills: all.filter((x) => x !== "away"), available: !all.includes("away") };
}

export const joinSkills = (skills: string[], available: boolean) => [...new Set(skills.map((s) => s.trim().toLowerCase()).filter(Boolean)), ...(available ? [] : ["away"])].join(", ");

export const roleOf = (skill: string) => ROLES.find((r) => r.skill === skill)?.role ?? skill.replace(/\b\w/g, (c) => c.toUpperCase());

/** Fictional club members (emails match the seeded past events, so their history shows up). */
export const DEMO_MEMBERS: [string, string, string[]][] = [
  ["Aditi Rao", "aditi@example.com", ["registration", "design"]],
  ["Rahul Menon", "rahul@example.com", ["av"]],
  ["Sneha Iyer", "sneha@example.com", ["logistics", "hospitality"]],
  ["Karthik S", "karthik@example.com", ["av", "tech"]],
  ["Meera Nair", "meera@example.com", ["social", "design"]],
  ["Farhan Ali", "farhan@example.com", ["tech", "logistics"]],
  ["Ishita Das", "ishita.das@example.com", ["registration", "hospitality"]],
  ["Varun Prasad", "varun.prasad@example.com", ["social"]],
];

export type EventRow = {
  id: string;
  brief: string;
  name: string | null;
  theme: string | null;
  date: string | null;
  budget: number | null;
  expected_attendees: number | null;
  venue: string | null;
  summary: string | null;
  created_at: string;
  plan: {
    budget_split?: { head: string; amount: number }[];
    tiers?: { name: string; amount: number; perks: string[] }[];
    timeline?: { date: string; milestone: string }[];
    comms?: { announcement: string; reminder_subject: string; reminder_body: string };
  } | null;
};

export type Sponsor = {
  id: string;
  company: string;
  contact_email: string;
  tier: string | null;
  fit_score: number | null;
  pitch_subject: string | null;
  pitch_body: string | null;
  status: "lead" | "drafted" | "contacted" | "replied" | "confirmed" | "declined";
};

export type Volunteer = { id: string; name: string; email: string; skills: string | null };
export type Task = { id: string; title: string; skill: string | null; starts_at: string; ends_at: string; volunteer_id: string | null };
export type Attendee = { id: string; name: string; email: string; usn: string | null; checked_in: boolean; certificate_sent: boolean; created_at: string };
export type Run = { id: string; agent: string; summary: string; ok: boolean; created_at: string };

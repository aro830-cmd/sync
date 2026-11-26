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
    kind?: "funded" | "free";
    suggestions?: { company: string; why: string; fit_score: number; tier: string }[];
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

/** A free event (seminar, talk) has no budget and no sponsors. */
export const isFree = (e: Pick<EventRow, "plan">) => e.plan?.kind === "free";

// ── migration 002: sponsor CRM, volunteer profiles, roles, rewards, incidents, audit (supabase/migrations/002_*.sql) ──

export const CONTRIBUTIONS = ["cash", "credits", "prizes", "hardware", "food", "venue", "mentors", "hiring", "marketing"] as const;
export type Contribution = (typeof CONTRIBUTIONS)[number];
export type Confidence = "high" | "medium" | "low";

export type Company = {
  id: string;
  name: string;
  industry: string | null;
  city: string | null;
  website: string | null;
  contact_route: string | null;
  contribution_types: Contribution[];
  est_value: number | null;
  notes: string | null;
  created_at: string;
};
export type CompanySource = { id: string; company_id: string; claim: string; kind: "history" | "profile" | "contact" | "news"; url: string; source_date: string | null; confidence: Confidence; added_at: string };
export type FitWeights = Record<"theme" | "local" | "student_history" | "value" | "timeline" | "evidence" | "relationship", number>;

export type DealTerms = Partial<Record<"obligations" | "exclusivity" | "data_sharing" | "branding" | "payment_terms" | "reporting" | "deadline", string>>;
export const PAYMENT_STATUSES = ["planned", "invoice_sent", "committed", "partially_received", "received", "overdue", "disputed"] as const;
export type SponsorPayment = { id: string; sponsor_id: string; label: string; amount: number; received_amount: number; due_date: string | null; status: (typeof PAYMENT_STATUSES)[number]; note: string | null; updated_at: string };
export type Deliverable = { id: string; sponsor_id: string; item: string; due_date: string | null; done: boolean; evidence_url: string | null; done_at: string | null };

export type Slot = { date?: string; weekday?: number; from: string; to: string };
export type VolunteerProfile = {
  id: string;
  email: string;
  name: string;
  student_id: string | null;
  skills: string[];
  preferred_roles: string[];
  availability: Slot[];
  available: boolean;
  learning_goals: string | null;
  reward_prefs: string[];
  languages: string[];
  accessibility_needs: string | null;
  opted_in: boolean;
};
export type MissionRole = { key: string; name: string; responsibilities: string; expected_hours: number; skills: string[]; learning_outcomes: string; supervisor: string; reward: string; escalation: string; sort: number };
export type RoleRequest = { id: string; event_id: string; role_key: string; profile_id: string; status: "suggested" | "requested" | "accepted" | "declined" | "completed"; reason: string | null; overridden: boolean };
export type Reward = { id: string; profile_id: string; event_id: string | null; kind: "certificate" | "meal" | "merch" | "reimbursement" | "recommendation" | "mentor_session" | "priority_access"; status: "promised" | "delivered"; note: string | null; delivered_at: string | null };
export type Incident = { id: string; event_id: string; title: string; severity: "low" | "medium" | "high"; status: "open" | "resolved"; note: string | null; created_at: string; resolved_at: string | null };
export type AuditEntry = { id: string; actor: string; event_id: string | null; entity: string; entity_id: string | null; action: string; detail: Record<string, unknown>; created_at: string };

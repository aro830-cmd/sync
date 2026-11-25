// Shared by server and client: pipeline order and display copy.
export type AgentName = "planner" | "sponsorship" | "logistics" | "comms" | "reporting";

export type Agent = {
  id: AgentName;
  name: string;
  does: string;
  /** One-paragraph job description for the agent's own page. */
  about: string;
  needs: string[];
  makes: string[];
  /** Free events (seminars, talks) don't run this agent. */
  fundedOnly?: boolean;
};

export const AGENTS: Agent[] = [
  {
    id: "planner",
    name: "Planner",
    does: "Budget, tiers, timeline",
    about: "Reads your one-line brief and decides whether it's a funded event or a free one. Funded events get a budget split and sponsor tiers; every event gets a dated timeline from today to the day itself.",
    needs: ["The one-line brief"],
    makes: ["Event name, theme, date, venue", "Budget split (funded)", "Sponsor tiers (funded)", "5–7 milestones"],
  },
  {
    id: "sponsorship",
    name: "Sponsorship",
    does: "Recommends sponsors, drafts pitches",
    about: "Recommends real companies that fit the event, scores every lead for fit and writes a tailored cold email for each. Nothing is sent until you press Approve & send. Skipped for free events.",
    needs: ["A plan with sponsor tiers", "Your leads (optional — it recommends its own)"],
    makes: ["8 recommended sponsors with reasons", "Fit score + tier per lead", "Editable pitch drafts"],
    fundedOnly: true,
  },
  {
    id: "logistics",
    name: "Logistics",
    does: "Run-of-show, volunteer shifts",
    about: "Writes the day's run-of-show and assigns your volunteers to shifts with a deterministic scheduler — no one is ever double-booked, and skills are matched where a task needs them.",
    needs: ["Volunteers with skills"],
    makes: ["8–14 timed tasks", "Clash-free assignments", "Shift emails"],
  },
  {
    id: "comms",
    name: "Comms",
    does: "Registration, announcement",
    about: "Opens the public registration page, drafts the WhatsApp/Instagram announcement and the attendee reminder, and powers check-in and certificates on the day.",
    needs: ["A plan"],
    makes: ["Registration page", "Announcement + reminder", "Certificates for checked-in attendees"],
  },
  {
    id: "reporting",
    name: "Reporting",
    does: "Event report PDF",
    about: "Writes the post-event report from real attendance and confirmed partners only — a sponsor report for funded events, a club report for free ones — and renders it as a PDF.",
    needs: ["Registrations and check-ins"],
    makes: ["Report summary", "PDF", "Email to confirmed partners"],
  },
];

export const agentsFor = (free: boolean) => (free ? AGENTS.filter((a) => !a.fundedOnly) : AGENTS);

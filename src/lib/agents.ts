// Shared by server and client: pipeline order and display copy.
export type AgentName = "planner" | "sponsorship" | "logistics" | "comms" | "reporting";

export const AGENTS: { id: AgentName; name: string; does: string }[] = [
  { id: "planner", name: "Planner", does: "Budget, tiers, timeline" },
  { id: "sponsorship", name: "Sponsorship", does: "Ranks leads, drafts pitches" },
  { id: "logistics", name: "Logistics", does: "Run-of-show, volunteer shifts" },
  { id: "comms", name: "Comms", does: "Registration, announcement" },
  { id: "reporting", name: "Reporting", does: "Sponsor report" },
];

// Plain module: the organiser sidebar for the cross-event pages (home, past events, agent pages).
import { AGENTS, type AgentName } from "@/lib/agents";
import { Icon } from "./icons";
import type { NavItem } from "./shell";

export function homeNav(active: "home" | "past" | "sponsors" | AgentName, counts?: { upcoming: number; past: number }): { label?: string; items: NavItem[] }[] {
  return [
    {
      items: [
        { key: "home", label: "Overview", icon: Icon.overview, href: "/dashboard", active: active === "home", hint: counts ? String(counts.upcoming) : undefined },
        { key: "past", label: "Past events", icon: Icon.past, href: "/dashboard/past", active: active === "past", hint: counts ? String(counts.past) : undefined },
        { key: "sponsors", label: "Sponsors", icon: Icon.partners, href: "/dashboard/sponsors", active: active === "sponsors" },
      ],
    },
    { label: "Agents", items: AGENTS.map((a) => ({ key: a.id, label: a.name, icon: Icon[a.id], href: `/dashboard/agents/${a.id}`, active: active === a.id })) },
  ];
}

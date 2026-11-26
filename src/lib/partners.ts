// Company profiles for the sponsor directory. All fictional demo partners (emails are @example.com).
// Companies without a profile still show up in the directory, just with their sponsorship history only.

export type PartnerProfile = {
  industry: string;
  city: string;
  contact: string;
  role: string;
  website: string;
  since: string;
  notes: string;
};

export const PROFILES: Record<string, PartnerProfile> = {
  "Northwind Cloud": { industry: "Cloud infrastructure", city: "Bengaluru", contact: "Meera Iyer", role: "Developer Relations Lead", website: "northwind.example.com", since: "2025", notes: "Our most reliable Title partner. Always asks for a keynote slot and the resume book; pays within 2 weeks of the invoice." },
  "Kestrel Labs": { industry: "AI research tools", city: "Hyderabad", contact: "Arvind Rao", role: "Campus Programs Manager", website: "kestrel.example.com", since: "2025", notes: "Sends two engineers as judges. Prefers Gold; wants a booth near the entrance." },
  "Lumen Devices": { industry: "Consumer hardware", city: "Pune", contact: "Sana Qureshi", role: "Brand Partnerships", website: "lumen.example.com", since: "2026", notes: "Sponsors hardware tracks with dev kits worth more than the cash amount. Ask early — kits take 3 weeks to ship." },
  "Orbit Pay": { industry: "Fintech / payments APIs", city: "Bengaluru", contact: "Rohit Menon", role: "Developer Marketing", website: "orbitpay.example.com", since: "2026", notes: "Runs a 'best use of the API' prize on top of the tier. Needs final attendee count for swag." },
  "Ferrum Systems": { industry: "DevOps & CI", city: "Chennai", contact: "Kavitha Raman", role: "Community Manager", website: "ferrum.example.com", since: "2026", notes: "Gives cloud credits to every attendee. Small cash, big goodwill." },
  "Quill Analytics": { industry: "Data analytics", city: "Mumbai", contact: "Neil D'Souza", role: "University Relations", website: "quill.example.com", since: "2026", notes: "Declined twice — budget is planned in April. Pitch them in Q1 for the next academic year." },
  "Tidepool Data": { industry: "Data engineering", city: "Bengaluru", contact: "Priyanka Shah", role: "Talent Acquisition", website: "tidepool.example.com", since: "2026", notes: "Interested in hiring interns rather than branding. Offer a recruiting slot instead of a logo." },
  "Sundial Robotics": { industry: "Robotics", city: "Bengaluru", contact: "Vivek Nair", role: "Outreach Lead", website: "sundial.example.com", since: "—", notes: "New lead for Byte Bash '27. Strong fit for a hardware track." },
  "Peregrine Games": { industry: "Game studio", city: "Bengaluru", contact: "Ishaan Gupta", role: "Studio Community", website: "peregrine.example.com", since: "—", notes: "New lead. Would sponsor a game-jam track with prizes and mentors." },
  "Bluebird Bank": { industry: "Banking", city: "Mumbai", contact: "Ananya Pillai", role: "CSR Programs", website: "bluebird.example.com", since: "2025", notes: "Funds from the CSR budget — needs a short impact report after the event, which the Reporting agent covers." },
  "Copperleaf Studio": { industry: "Design agency", city: "Bengaluru", contact: "Rhea Kapoor", role: "Founder", website: "copperleaf.example.com", since: "2026", notes: "Sponsors design sprints in kind: mentors and a portfolio review session." },
};

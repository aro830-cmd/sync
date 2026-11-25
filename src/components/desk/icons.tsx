// Plain module (not "use client") so server pages can pass these icons as props too.

export const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const Icon = {
  overview: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>,
  planner: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  sponsorship: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3.5 12.5h17" /></svg>,
  logistics: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  comms: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M4 5.5h16v10H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
  reporting: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="7" width="3" height="10" rx="1" /><rect x="15.5" y="4" width="3" height="13" rx="1" /></svg>,
  events: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M4 6.5h16M4 12h16M4 17.5h10" /></svg>,
  back: <svg viewBox="0 0 24 24" className="size-4" {...P}><path d="M14.5 6 8.5 12l6 6" /></svg>,
  past: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3h3" /><path d="M12 8v4.2l2.8 1.8" /></svg>,
  partners: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M3.5 19c.8-3 3-4.6 5.5-4.6S13.7 16 14.5 19M14 14.8c.8-.3 1.6-.5 2.5-.5 2 0 3.6 1.4 4 4.2" /></svg>,
  spark: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4 18 18M6 18l2.6-2.6M15.4 8.6 18 6" /></svg>,
  student: <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" /></svg>,
};

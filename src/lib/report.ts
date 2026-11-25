import "server-only";
import { db } from "./server";
import { reportPdf } from "./pdf";

export async function reportStats(eventId: string) {
  const [att, spons] = await Promise.all([
    db().from("attendees").select("checked_in").eq("event_id", eventId),
    db().from("sponsors").select("company, tier, status").eq("event_id", eventId),
  ]);
  if (att.error || spons.error) throw new Error((att.error ?? spons.error)!.message);
  return {
    registered: att.data.length,
    attended: att.data.filter((a) => a.checked_in).length,
    confirmed: spons.data.filter((s) => s.status === "confirmed"),
  };
}

export async function buildReport(eventId: string) {
  const { data: ev, error } = await db().from("events").select("*").eq("id", eventId).single();
  if (error) throw new Error(error.message);
  const s = await reportStats(eventId);
  return reportPdf({
    event: ev.name ?? "Event",
    date: ev.date ?? "",
    venue: ev.venue ?? "",
    stats: [
      [String(s.registered), "REGISTERED"],
      [String(s.attended), "ATTENDED"],
      [String(s.confirmed.length), "PARTNERS"],
    ],
    summary: ev.summary ?? "Run the Reporting agent to write this summary.",
    sponsors: s.confirmed,
  });
}

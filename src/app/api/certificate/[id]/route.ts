import { db } from "@/lib/server";
import { currentStudent } from "@/lib/student";
import { certificatePdf } from "@/lib/pdf";

// Signed-in student downloads their own certificate, only after check-in.
export async function GET(_req: Request, ctx: RouteContext<"/api/certificate/[id]">) {
  const { id } = await ctx.params;
  const me = await currentStudent();
  if (!me) return new Response("Log in first.", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const { data: a } = await db()
    .from("attendees")
    .select("name, checked_in, events(name, date)")
    .eq("event_id", id)
    .eq("email", me.email)
    .maybeSingle<{ name: string; checked_in: boolean; events: { name: string; date: string } | null }>();
  if (!a?.checked_in || !a.events) return new Response("Certificate is available after you are checked in.", { status: 403 });

  const pdf = await certificatePdf({ name: a.name, event: a.events.name, date: a.events.date, club: `Team ${a.events.name}` });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="certificate.pdf"` },
  });
}

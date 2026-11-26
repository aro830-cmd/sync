import { crmReady } from "@/lib/server";
import { roiPdf, sponsorDocData } from "@/lib/sponsor-pdf";

// Guarded by proxy.ts (organiser login). id = sponsor row id.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  if (!(await crmReady())) return new Response("Run supabase/migrations/002_sponsor_crm_volunteers.sql first.", { status: 409 });
  const data = await sponsorDocData(id);
  if (!data) return new Response("Not found", { status: 404 });
  const pdf = await roiPdf(data);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${data.company.replace(/[^\w-]+/g, "-")}-partner-report.pdf"` },
  });
}

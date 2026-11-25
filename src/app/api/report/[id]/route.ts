import { buildReport } from "@/lib/report";

// Guarded by proxy.ts (organiser login).
export async function GET(_req: Request, ctx: RouteContext<"/api/report/[id]">) {
  const { id } = await ctx.params;
  try {
    const pdf = await buildReport(id);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="sponsor-report.pdf"` },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Report failed", { status: 500 });
  }
}

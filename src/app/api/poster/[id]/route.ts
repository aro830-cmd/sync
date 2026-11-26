import { appUrl, posterEvent, posterPng } from "@/lib/poster";

// Public: a poster is meant to be shared, and it only shows what the registration page already shows.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const ev = await posterEvent(id);
  if (!ev?.name) return new Response("Not found", { status: 404 });
  const png = await posterPng(ev, `${await appUrl()}/e/${id}`);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `inline; filename="${ev.name.replace(/[^\w-]+/g, "-")}-poster.png"`, "Cache-Control": "no-store" },
  });
}

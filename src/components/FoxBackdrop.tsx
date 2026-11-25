import { foxStill } from "@/lib/fox";

/** The true-colour walking-fox cut-out over the landing's hot gradient, for side panels. */
export function FoxBackdrop({ position = "72% 50%" }: { position?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 70% at 62% 45%, #ff8a3d 0%, #f0561a 24%, #a8320b 50%, #3b1206 76%, #0b0806 100%)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain img for a static cut-out in public/ */}
      <img src={foxStill("story")} alt="" className="h-full w-full object-cover" style={{ objectPosition: position }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0806]/85 via-[#0b0806]/35 to-transparent" />
    </div>
  );
}

import { foxStill } from "@/lib/fox";

/** The walking-fox still in the landing's orange duotone (multiply over a hot gradient), for side panels. */
export function FoxBackdrop({ position = "72% 50%" }: { position?: string }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(80% 70% at 62% 45%, #ff8a3d 0%, #f0561a 24%, #a8320b 50%, #3b1206 76%, #0b0806 100%)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- brief: use the resizer URL as-is, never re-host */}
      <img src={foxStill("story", 1024)} alt="" className="h-full w-full object-cover mix-blend-multiply [filter:grayscale(1)_contrast(1.22)_brightness(1.04)]" style={{ objectPosition: position }} />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0806]/85 via-[#0b0806]/35 to-transparent" />
    </div>
  );
}

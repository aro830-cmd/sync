/** The fox mascot app icon, used next to every "Relay" wordmark. */
export function FoxMark({ className = "" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static icon; next/image adds nothing at this size
  return <img src="/fox/icon.png" alt="" width={96} height={96} className={className} />;
}

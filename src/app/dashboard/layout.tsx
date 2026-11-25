// Dark desk frame; each page draws its own sidebar via <Shell>.
export default function DeskLayout({ children }: LayoutProps<"/dashboard">) {
  return <div className="desk min-h-screen">{children}</div>;
}

import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, readToken } from "@/lib/token";

// Organiser desk: signed-in organisers pass; everyone else goes to /admin/login (API calls get a 401).
export function proxy(request: NextRequest) {
  if (!process.env.ADMIN_PASSCODE) return NextResponse.next(); // dev convenience; server actions refuse this in production
  if (readToken(request.cookies.get(ADMIN_COOKIE)?.value) === "admin") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) return new NextResponse("Log in as organiser first.", { status: 401 });
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/dashboard/:path*", "/api/report/:path*"] };

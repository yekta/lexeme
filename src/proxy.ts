import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { SIGN_IN_PATHNAME } from "@/lib/constants";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL(SIGN_IN_PATHNAME, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/deck/:path*", "/study/:path*"],
};

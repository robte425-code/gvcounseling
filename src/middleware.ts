import { auth } from "@/middleware-auth";
import { NextResponse } from "next/server";

const PUBLIC_AUTH_PREFIXES = ["/portal/login", "/portal/forgot-password", "/portal/reset-password"];

function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const mustChange = req.auth?.user?.mustChangePassword;
  const role = req.auth?.user?.role;

  if (isPublicAuthPath(pathname)) {
    if (isLoggedIn && !mustChange) {
      if (pathname.startsWith("/portal/reset-password")) {
        return NextResponse.next();
      }
      if (pathname.startsWith("/portal/forgot-password")) {
        const dest = role === "ADMIN" ? "/portal/admin/dashboard" : "/portal/therapist/account";
        return NextResponse.redirect(new URL(dest, req.url));
      }
      if (pathname.startsWith("/portal/login")) {
        const dest = role === "ADMIN" ? "/portal/admin/dashboard" : "/portal/therapist/dashboard";
        return NextResponse.redirect(new URL(dest, req.url));
      }
    }
    return NextResponse.next();
  }

  if (!pathname.startsWith("/portal")) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    const login = new URL("/portal/login", req.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  if (mustChange && !pathname.startsWith("/portal/change-password")) {
    return NextResponse.redirect(new URL("/portal/change-password", req.url));
  }

  if (pathname.startsWith("/portal/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal/therapist/dashboard", req.url));
  }

  if (pathname.startsWith("/portal/therapist") && role !== "THERAPIST") {
    return NextResponse.redirect(new URL("/portal/admin/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/portal/:path*"],
};

import { auth } from "@/middleware-auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const mustChange = req.auth?.user?.mustChangePassword;

  if (pathname.startsWith("/portal/login")) {
    if (isLoggedIn && !mustChange) {
      const dest =
        req.auth?.user?.role === "ADMIN" ? "/portal/admin/dashboard" : "/portal/therapist/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
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

  if (pathname.startsWith("/portal/admin") && req.auth?.user?.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal/therapist/dashboard", req.url));
  }

  if (pathname.startsWith("/portal/therapist") && req.auth?.user?.role !== "THERAPIST") {
    return NextResponse.redirect(new URL("/portal/admin/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/portal/:path*"],
};

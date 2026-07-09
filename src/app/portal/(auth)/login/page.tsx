"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { portalButtonClass, portalCardClass, portalInputClass, portalLabelClass } from "@/components/portal/ui";

export default function PortalLoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const data = new FormData(e.currentTarget);
    const result = await signIn("credentials", {
      email: data.get("email"),
      password: data.get("password"),
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    window.location.href = "/portal";
  }

  return (
    <div className={portalCardClass}>
      <h1 className="font-serif text-2xl font-semibold text-primary-dark">Billing portal</h1>
      <p className="mt-2 text-sm text-muted">Sign in with your Grandview Counseling account.</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className={portalLabelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" required className={portalInputClass} />
        </div>
        <div>
          <label htmlFor="password" className={portalLabelClass}>
            Password
          </label>
          <input id="password" name="password" type="password" required className={portalInputClass} />
        </div>
        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={`${portalButtonClass} w-full`}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/portal/forgot-password" className="text-primary hover:underline">
          Forgot password?
        </Link>
        {" · "}
        <Link href="/" className="text-primary hover:underline">
          Back to website
        </Link>
      </p>
    </div>
  );
}

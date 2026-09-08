"use client";

import Link from "next/link";
import { useState } from "react";
import { register } from "@/lib/api";

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(companyName, email, password, confirmPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Check your email</h1>
        <p className="text-sm text-gray-600">
          We sent a verification link to {email}. Click it to activate your company, then log in.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Register your company</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          placeholder="Company name"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          type="password"
          placeholder="Confirm password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded border px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
          {loading ? "Creating..." : "Create company"}
        </button>
      </form>
      <Link href="/" className="mt-4 text-sm text-gray-600">
        Already have an account? Log in
      </Link>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { register, verifyEmailCode } from "@/lib/api";

export default function RegisterPage() {
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(companyName, email, password, confirmPassword);
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      await verifyEmailCode(email, code);
      setVerified(true);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Email verified</h1>
        <p className="mb-4 text-sm text-gray-600">Your company is now active.</p>
        <Link href="/" className="text-sm text-gray-600 underline">
          Log in
        </Link>
      </main>
    );
  }

  if (registered) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
        <h1 className="mb-2 text-xl font-semibold text-center">Check your email</h1>
        <p className="mb-6 text-center text-sm text-gray-600">
          We sent a verification code to {email}. Enter it below to activate your company.
        </p>
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <input
            placeholder="Verification code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded border px-3 py-2 text-center tracking-widest"
          />
          {codeError && <p className="text-sm text-red-600">{codeError}</p>}
          <button
            type="submit"
            disabled={verifying}
            className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50"
          >
            {verifying ? "Verifying..." : "Verify email"}
          </button>
        </form>
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

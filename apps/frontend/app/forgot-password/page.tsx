"use client";

import { useState } from "react";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Forgot password</h1>
      {done ? (
        <p className="text-sm text-gray-600">If that email exists, a reset link has been sent.</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border px-3 py-2"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-white">
            Send reset link
          </button>
        </form>
      )}
    </main>
  );
}

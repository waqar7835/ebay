"use client";

import type { Role } from "@ebay-order-management/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

const USER_TYPES: { role: Role; label: string }[] = [
  { role: "ADMIN" as Role, label: "Admin" },
  { role: "STAFF" as Role, label: "Staff" },
  { role: "ACCOUNT_HOLDER" as Role, label: "Account Holder" },
  { role: "STOCK_OWNER" as Role, label: "Stock Owner" },
  { role: "THREE_PL" as Role, label: "3PL" },
];

export default function LoginPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<Role>("ADMIN" as Role);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await login(email, password, userType);
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("user", JSON.stringify(user));
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Partner Portal Login</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="text-sm text-gray-600">
          User type
          <select
            value={userType}
            onChange={(e) => setUserType(e.target.value as Role)}
            className="mt-1 w-full rounded border px-3 py-2 text-black"
          >
            {USER_TYPES.map(({ role, label }) => (
              <option key={role} value={role}>
                {label}
              </option>
            ))}
          </select>
        </label>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50">
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <Link href="/forgot-password" className="mt-4 text-sm text-gray-600">
        Forgot password?
      </Link>
      <p className="mt-4 text-sm text-gray-600">
        New company?{" "}
        <Link href="/register" className="underline">
          Register here
        </Link>
      </p>
    </main>
  );
}

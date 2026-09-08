"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { verifyEmail } from "@/lib/api";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailStatus />
    </Suspense>
  );
}

function VerifyEmailStatus() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Verification failed");
      });
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-center">
      {status === "loading" && <p>Verifying...</p>}
      {status === "ok" && (
        <>
          <h1 className="mb-2 text-xl font-semibold">Email verified</h1>
          <Link href="/" className="text-sm text-gray-600 underline">
            Log in
          </Link>
        </>
      )}
      {status === "error" && <p className="text-sm text-red-600">{message}</p>}
    </main>
  );
}

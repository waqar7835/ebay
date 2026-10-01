"use client";

import { Alert, Spin } from "antd";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthShell, { DoneIcon } from "@/components/site/AuthShell";
import { verifyEmail } from "@/lib/api";

export default function VerifyEmailPage() {
  return (
    <AuthShell variant="register" topLink={{ text: "Already verified?", href: "/login", label: "Log in" }}>
      <Suspense fallback={null}>
        <VerifyEmailStatus />
      </Suspense>
    </AuthShell>
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
      setMessage("This verification link is missing its token. Use the latest link from your email, or enter the 6-digit code.");
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
    <div className="card" style={{ textAlign: "center" }}>
      {status === "loading" && (
        <Spin tip="Verifying your email...">
          <div style={{ height: 80 }} />
        </Spin>
      )}
      {status === "ok" && (
        <>
          <DoneIcon />
          <h1>Email verified</h1>
          <p className="sub">Your company is active. Log in as Admin to invite your partners.</p>
          <Link className="btn btn-dark btn-block" href="/login" style={{ marginTop: 22 }}>
            Log in
          </Link>
        </>
      )}
      {status === "error" && (
        <>
          <h1>We couldn&apos;t verify that link</h1>
          <Alert type="error" title={message} showIcon style={{ marginTop: 16, textAlign: "left" }} />
          <Link className="btn btn-light btn-block" href="/register" style={{ marginTop: 18 }}>
            Back to registration
          </Link>
        </>
      )}
    </div>
  );
}

"use client";

import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { useState } from "react";
import AuthShell, { DoneIcon } from "@/components/site/AuthShell";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish({ email }: { email: string }) {
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell variant="account" topLink={{ text: "Remembered it?", href: "/login", label: "Log in" }}>
      <div className="card" style={done ? { textAlign: "center" } : undefined}>
        {done ? (
          <>
            <DoneIcon kind="mail" />
            <h1>Check your inbox</h1>
            <p className="sub">If that email exists, a reset link has been sent.</p>
            <Link className="btn btn-light btn-block" href="/login" style={{ marginTop: 22 }}>
              Back to log in
            </Link>
          </>
        ) : (
          <>
            <h1>Forgot password</h1>
            <p className="sub">Enter your email and we&apos;ll send you a link to reset your password.</p>
            <Form className="af" layout="vertical" requiredMark={false} onFinish={handleFinish} style={{ marginTop: 24 }}>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
                <Input autoComplete="email" placeholder="you@company.com" />
              </Form.Item>
              {error && <Alert type="error" title={error} showIcon />}
              <Button className="submit" type="primary" htmlType="submit" loading={loading} block>
                Send reset link
              </Button>
            </Form>
            <p className="alt">
              <Link href="/login">Back to log in</Link>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}

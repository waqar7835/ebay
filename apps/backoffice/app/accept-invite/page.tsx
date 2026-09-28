"use client";

import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { acceptInvite } from "@/lib/api";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm />
    </Suspense>
  );
}

function AcceptInviteForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await acceptInvite(token, password, confirmPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Account activated</h1>
        <Link href="/" className="text-sm text-gray-600 underline">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Set your password</h1>
      <Form layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="password" rules={[{ required: true, message: "Enter a password" }]}>
          <Input.Password placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Form.Item>
        <Form.Item name="confirmPassword" rules={[{ required: true, message: "Confirm your password" }]}>
          <Input.Password placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </Form.Item>
        {error && <Alert type="error" title={error} className="mb-4" showIcon />}
        <Button type="primary" htmlType="submit" loading={submitting} block>
          Activate account
        </Button>
      </Form>
    </main>
  );
}

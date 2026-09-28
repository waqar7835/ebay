"use client";

import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish({ email }: { email: string }) {
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Forgot password</h1>
      {done ? (
        <Alert type="success" title="If that email exists, a reset link has been sent." showIcon />
      ) : (
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input placeholder="Email" />
          </Form.Item>
          {error && <Alert type="error" title={error} className="mb-4" showIcon />}
          <Button type="primary" htmlType="submit" loading={loading} block>
            Send reset link
          </Button>
        </Form>
      )}
    </main>
  );
}

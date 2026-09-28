"use client";

import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish({ email, password }: { email: string; password: string }) {
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await login(email, password);
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
      <h1 className="mb-6 text-2xl font-semibold">Backoffice Login</h1>
      <Form layout="vertical" onFinish={handleFinish}>
        <Form.Item name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input placeholder="Email" />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: "Enter your password" }]}>
          <Input.Password placeholder="Password" />
        </Form.Item>
        {error && <Alert type="error" title={error} className="mb-4" showIcon />}
        <Button type="primary" htmlType="submit" loading={loading} block>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </Form>
      <div className="mt-4 flex justify-end text-sm text-gray-600">
        <Link href="/forgot-password">Forgot password?</Link>
      </div>
    </main>
  );
}

"use client";

import type { Role } from "@ebay-order-management/shared";
import { Alert, Button, Form, Input, Select } from "antd";
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

interface LoginValues {
  userType: Role;
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleFinish({ userType, email, password }: LoginValues) {
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
      <Form<LoginValues> layout="vertical" onFinish={handleFinish} initialValues={{ userType: "ADMIN" }}>
        <Form.Item name="userType" label="User type">
          <Select options={USER_TYPES.map(({ role, label }) => ({ value: role, label }))} />
        </Form.Item>
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { register, verifyEmailCode } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
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

  async function handleSubmit() {
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

  async function handleVerify() {
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

  useEffect(() => {
    if (!verified) return;
    const timer = setTimeout(() => router.push("/"), 1500);
    return () => clearTimeout(timer);
  }, [verified, router]);

  if (verified) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">Email verified</h1>
        <p className="mb-4 text-sm text-gray-600">Your company is now active. Redirecting you to log in...</p>
        <Link href="/" className="text-sm text-gray-600 underline">
          Log in now
        </Link>
      </main>
    );
  }

  if (registered) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
        <h1 className="mb-2 text-center text-xl font-semibold">Check your email</h1>
        <p className="mb-6 text-center text-sm text-gray-600">
          We sent a verification code to {email}. Enter it below to activate your company.
        </p>
        <Form layout="vertical" onFinish={handleVerify}>
          <Form.Item name="code" rules={[{ required: true, message: "Enter the code from your email" }]}>
            <Input.OTP length={6} value={code} onChange={setCode} />
          </Form.Item>
          {codeError && <Alert type="error" title={codeError} className="mb-4" showIcon />}
          <Button type="primary" htmlType="submit" loading={verifying} block>
            {verifying ? "Verifying..." : "Verify email"}
          </Button>
        </Form>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-6 text-2xl font-semibold">Register your company</h1>
      <Form layout="vertical" onFinish={handleSubmit}>
        <Form.Item name="companyName" rules={[{ required: true, message: "Enter your company name" }]}>
          <Input placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </Form.Item>
        <Form.Item name="email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Form.Item>
        <Form.Item name="password" rules={[{ required: true, message: "Enter a password" }]}>
          <Input.Password placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Form.Item>
        <Form.Item name="confirmPassword" rules={[{ required: true, message: "Confirm your password" }]}>
          <Input.Password placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </Form.Item>
        {error && <Alert type="error" title={error} className="mb-4" showIcon />}
        <Button type="primary" htmlType="submit" loading={loading} block>
          {loading ? "Creating..." : "Create company"}
        </Button>
      </Form>
      <Link href="/" className="mt-4 text-sm text-gray-600">
        Already have an account? Log in
      </Link>
    </main>
  );
}

"use client";

import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthShell, { DoneIcon } from "@/components/site/AuthShell";
import { acceptInvite } from "@/lib/api";

export default function AcceptInvitePage() {
  return (
    <AuthShell variant="login" topLink={{ text: "Already set up?", href: "/login", label: "Log in" }}>
      <Suspense fallback={null}>
        <AcceptInviteForm />
      </Suspense>
    </AuthShell>
  );
}

interface InviteValues {
  password: string;
  confirmPassword: string;
}

function AcceptInviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit({ password, confirmPassword }: InviteValues) {
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

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.push("/login"), 1500);
    return () => clearTimeout(timer);
  }, [done, router]);

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <DoneIcon />
        <h1>Account activated</h1>
        <p className="sub">Taking you to log in...</p>
        <Link className="btn btn-dark btn-block" href="/login" style={{ marginTop: 22 }}>
          Log in now
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Set your password</h1>
      <p className="sub">You&apos;ve been invited to join a company. Choose a password to activate your account.</p>
      <Form<InviteValues> className="af" layout="vertical" requiredMark={false} onFinish={handleSubmit} style={{ marginTop: 24 }}>
        <Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: "Use at least 8 characters" }]}>
          <Input.Password autoComplete="new-password" placeholder="At least 8 characters" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Confirm password"
          dependencies={["password"]}
          rules={[
            { required: true, message: "Confirm your password" },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || value === getFieldValue("password") ? Promise.resolve() : Promise.reject(new Error("Passwords don't match")),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="Type it again" />
        </Form.Item>
        {error && <Alert type="error" title={error} showIcon />}
        <Button className="submit" type="primary" htmlType="submit" loading={submitting} block>
          Activate account
        </Button>
      </Form>
    </div>
  );
}

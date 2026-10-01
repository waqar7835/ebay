"use client";

import { Button, Form, Input } from "antd";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell, { DoneIcon, useAuthToasts } from "@/components/site/AuthShell";
import { resetPassword } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <AuthShell variant="account" topLink={{ text: "Remembered it?", href: "/login", label: "Log in" }}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}

interface ResetValues {
  password: string;
  confirmPassword: string;
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { onFinishFailed, showError } = useAuthToasts();
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit({ password, confirmPassword }: ResetValues) {
    setSubmitting(true);
    try {
      await resetPassword(token, password, confirmPassword);
      setDone(true);
    } catch (err) {
      showError(err, "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <DoneIcon />
        <h1>Password updated</h1>
        <p className="sub">You can now log in with your new password.</p>
        <Link className="btn btn-dark btn-block" href="/login" style={{ marginTop: 22 }}>
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h1>Reset password</h1>
      <p className="sub">Choose a new password for your account.</p>
      <Form<ResetValues>
        className="af"
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
        onFinishFailed={onFinishFailed}
        style={{ marginTop: 24 }}
      >
        <Form.Item
          name="password"
          label="New password"
          rules={[{ required: true, min: 8, message: "Use at least 8 characters" }]}
        >
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
                !value || value === getFieldValue("password")
                  ? Promise.resolve()
                  : Promise.reject(new Error("Passwords don't match")),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="Type it again" />
        </Form.Item>
        <Button className="submit" type="primary" htmlType="submit" loading={submitting} block>
          Update password
        </Button>
      </Form>
    </div>
  );
}

"use client";

import { Role } from "@ebay-order-management/shared";
import { Alert, Button, Form, Input, Radio } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AuthShell, { AuthNote } from "@/components/site/AuthShell";
import { login } from "@/lib/api";
import { ROLE_COLORS } from "@/lib/brand";

const USER_TYPES: { role: Role; label: string; color: string; bg: string }[] = [
  { role: Role.ADMIN, label: "Admin", color: ROLE_COLORS.admin, bg: "#eaf2ff" },
  { role: Role.STAFF, label: "Staff", color: ROLE_COLORS.staff, bg: "#e9efff" },
  { role: Role.ACCOUNT_HOLDER, label: "Account Holder", color: ROLE_COLORS.accountHolder, bg: "#fff1ee" },
  { role: Role.STOCK_OWNER, label: "Stock Owner", color: ROLE_COLORS.stockOwner, bg: "#f7eeff" },
  { role: Role.THREE_PL, label: "3PL", color: ROLE_COLORS.threePl, bg: "#e8f9fc" },
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
      localStorage.removeItem("navCompany"); // the portal sidebar re-reads this account's company
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <AuthShell variant="login" topLink={{ text: "New company?", href: "/register", label: "Register" }}>
      <div className="card">
        <h1>Log in</h1>
        <p className="sub">Use the email and password for the role you&apos;re logging in as.</p>
        <Form<LoginValues>
          className="af"
          layout="vertical"
          requiredMark={false}
          onFinish={handleFinish}
          initialValues={{ userType: Role.ADMIN }}
          style={{ marginTop: 24 }}
        >
          <Form.Item name="userType" label="I'm logging in as">
            <Radio.Group className="role-pick">
              {USER_TYPES.map((t) => (
                <Radio.Button
                  key={t.role}
                  value={t.role}
                  style={{ "--rc": t.color, "--rbg": t.bg } as React.CSSProperties}
                >
                  <i style={{ background: t.color }} />
                  {t.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input autoComplete="email" placeholder="you@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label={
              <span className="lab-row">
                Password <Link href="/forgot-password">Forgot password?</Link>
              </span>
            }
            rules={[{ required: true, message: "Enter your password" }]}
          >
            <Input.Password autoComplete="current-password" placeholder="Your password" />
          </Form.Item>
          {error && <Alert type="error" title={error} showIcon />}
          <Button className="submit" type="primary" htmlType="submit" loading={loading} block>
            {loading ? "Signing in..." : "Log in"}
          </Button>
        </Form>
        <p className="alt">
          New company? <Link href="/register">Register here</Link>
        </p>
      </div>
      <AuthNote>
        <b>One email, several roles?</b> Each role has its own account and password. Choose the role above that matches the
        account you&apos;re logging in to.
      </AuthNote>
    </AuthShell>
  );
}

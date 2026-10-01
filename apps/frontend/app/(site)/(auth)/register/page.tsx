"use client";

import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import AuthShell, { AuthNote, DoneIcon } from "@/components/site/AuthShell";
import { register, resendVerification, verifyEmailCode } from "@/lib/api";

type Step = "details" | "verify" | "done";

interface DetailsValues {
  companyName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "verify", label: "Verify email" },
  { key: "done", label: "Done" },
];

/** 0–4 score for the strength bar: length, mixed case, digits, symbols / long passphrase. */
function passwordScore(v: string): number {
  if (!v) return 0;
  if (v.length < 8) return 1;
  let s = 1;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) s++;
  return Math.min(s, 4);
}
const SCORE_TEXT = [
  "Use 8 or more characters.",
  "Too short. Use 8 or more characters.",
  "Okay. Add numbers or symbols to make it stronger.",
  "Good password.",
  "Strong password.",
];

export default function RegisterPage() {
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(0);

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function handleDetails(values: DetailsValues) {
    setError(null);
    setLoading(true);
    try {
      await register(values.companyName.trim(), values.email.trim(), values.password, values.confirmPassword);
      setDetails(values);
      setCode("");
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!details) return;
    if (code.length !== 6) {
      setCodeError("Enter all 6 digits from your email.");
      return;
    }
    setCodeError(null);
    setVerifying(true);
    try {
      await verifyEmailCode(details.email.trim(), code);
      setStep("done");
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!details) return;
    setResendMsg(null);
    try {
      await resendVerification(details.email.trim());
      setResendIn(30);
      setResendMsg("A new code is on its way.");
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "Couldn't resend the code");
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <AuthShell
      variant="register"
      topLink={{ text: "Already registered?", href: "/login", label: "Log in" }}
      footNote="By creating a company you agree to the Terms and Privacy policy."
    >
      <div className="card">
        <div className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && <em />}
              <span className={i < stepIndex ? "done" : i === stepIndex ? "on" : ""} aria-current={i === stepIndex ? "step" : undefined}>
                <b>{i + 1}</b>
                {s.label}
              </span>
            </Fragment>
          ))}
        </div>

        {step === "details" && (
          <>
            <h1>Register your company</h1>
            <p className="sub">You&apos;ll use this email and password to log in as Admin.</p>
            <Form<DetailsValues>
              className="af"
              layout="vertical"
              requiredMark={false}
              onFinish={handleDetails}
              initialValues={details ?? undefined}
              style={{ marginTop: 24 }}
            >
              <Form.Item
                name="companyName"
                label="Company name"
                extra="Used for your invoice numbers, like AD-2026-001."
                rules={[{ required: true, whitespace: true, message: "Enter your company name" }]}
              >
                <Input autoComplete="organization" placeholder="Alpha Drop" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
                <Input autoComplete="email" placeholder="owner@company.com" />
              </Form.Item>
              <Form.Item
                name="password"
                label="Password"
                extra={
                  <>
                    <div className={`strength${score ? ` s${score}` : ""}`} aria-hidden>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <span>{SCORE_TEXT[score]}</span>
                  </>
                }
                rules={[{ required: true, min: 8, message: "Use at least 8 characters" }]}
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  onChange={(e) => setScore(passwordScore(e.target.value))}
                />
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
              <Button className="submit" type="primary" htmlType="submit" loading={loading} block>
                {loading ? "Creating..." : "Create company"}
              </Button>
            </Form>
            <p className="alt">
              Already have an account? <Link href="/login">Log in</Link>
            </p>
          </>
        )}

        {step === "verify" && details && (
          <>
            <h1>Check your email</h1>
            <p className="sub">
              We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{details.email.trim()}</b>. Enter it below to activate your
              company.
            </p>
            <Form className="af" layout="vertical" requiredMark={false} onFinish={handleVerify} style={{ marginTop: 24 }}>
              <Form.Item label="Verification code" validateStatus={codeError ? "error" : undefined} help={codeError ?? undefined}>
                <Input.OTP length={6} value={code} onChange={setCode} formatter={(v) => v.replace(/\D/g, "")} autoFocus />
              </Form.Item>
              <div className="resend" style={{ marginBottom: 18 }}>
                <span>The code expires in 30 minutes. You can also click the link in the email.</span>
                <button type="button" onClick={handleResend} disabled={resendIn > 0}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
              {resendMsg && <p className="hint" style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>{resendMsg}</p>}
              <Button className="submit" type="primary" htmlType="submit" loading={verifying} block>
                {verifying ? "Verifying..." : "Verify email"}
              </Button>
            </Form>
            <p className="alt">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setStep("details");
                }}
              >
                Use a different email
              </a>
            </p>
          </>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <DoneIcon />
            <h1>Email verified</h1>
            <p className="sub">
              <b style={{ color: "var(--ink)" }}>{details?.companyName.trim()}</b> is ready. Log in as Admin to invite your partners.
            </p>
            <Link className="btn btn-dark btn-block" href="/login" style={{ marginTop: 24 }}>
              Log in
            </Link>
          </div>
        )}
      </div>
      {step === "details" && (
        <AuthNote>
          <b>Invited by a company?</b> Don&apos;t register. Open the invite link in your email to set your password and join.
        </AuthNote>
      )}
    </AuthShell>
  );
}

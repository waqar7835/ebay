"use client";

import { Button, Form, Input } from "antd";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import AuthShell, { AuthNote, DoneIcon, useAuthToasts } from "@/components/site/AuthShell";
import { register, resendVerification, verifyEmailCode } from "@/lib/api";

type Step = "details" | "verify" | "done";

interface DetailsValues {
  companyName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

/** Same rules as RegisterDto on the backend. */
const PASSWORD_RULES: { label: string; test: (password: string, confirm: string) => boolean }[] = [
  { label: "8 or more characters", test: (p) => p.length >= 8 },
  { label: "At least 1 letter", test: (p) => /[A-Za-z]/.test(p) },
  { label: "At least 1 number", test: (p) => /\d/.test(p) },
  { label: "Passwords match", test: (p, c) => p.length > 0 && p === c },
];
const MATCH_RULE = PASSWORD_RULES.length - 1;

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "verify", label: "Verify email" },
  { key: "done", label: "Done" },
];

export default function RegisterPage() {
  const [form] = Form.useForm<DetailsValues>();
  const password = Form.useWatch("password", form) ?? "";
  const confirmPassword = Form.useWatch("confirmPassword", form) ?? "";
  /** Set on a submit attempt: unmet password rules then show red instead of an error message. */
  const [attempted, setAttempted] = useState(false);
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const { onFinishFailed, showError } = useAuthToasts();
  const [loading, setLoading] = useState(false);

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
    if (!PASSWORD_RULES.every((r) => r.test(values.password, values.confirmPassword))) {
      setAttempted(true);
      return;
    }
    setLoading(true);
    try {
      await register(values.companyName.trim(), values.email.trim(), values.password, values.confirmPassword);
      setDetails(values);
      setCode("");
      setStep("verify");
    } catch (err) {
      showError(err, "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!details) return;
    if (code.length !== 6) {
      setCodeError("Enter all 6 digits from your email.");
      showError(undefined, "Enter all 6 digits from your email.");
      return;
    }
    setCodeError(null);
    setVerifying(true);
    try {
      await verifyEmailCode(details.email.trim(), code);
      setStep("done");
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Verification failed");
      showError(err, "Verification failed");
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
      showError(err, "Couldn't resend the code");
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
              <span
                className={i < stepIndex ? "done" : i === stepIndex ? "on" : ""}
                aria-current={i === stepIndex ? "step" : undefined}
              >
                <b>{i + 1}</b>
                {s.label}
              </span>
            </Fragment>
          ))}
        </div>

        {step === "details" && (
          <>
            <h1>Register your company</h1>
            <AuthNote>
              <b>Invited by a company?</b> Don&apos;t register. Open the invite link in your email to set your password and join.
            </AuthNote>
            <Form<DetailsValues>
              form={form}
              className="af"
              layout="vertical"
              requiredMark={false}
              onFinish={handleDetails}
              onFinishFailed={(info) => {
                setAttempted(true);
                onFinishFailed(info);
              }}
              initialValues={details ?? undefined}
              style={{ marginTop: 18 }}
            >
              <Form.Item
                name="companyName"
                label="Company name"
                rules={[{ required: true, whitespace: true, message: "Enter your company name" }]}
              >
                <Input autoComplete="organization" placeholder="Your company name" />
              </Form.Item>
              <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
                <Input autoComplete="email" placeholder="owner@company.com" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true, message: "Enter a password" }]}>
                <Input.Password autoComplete="new-password" placeholder="Create a password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="Confirm password"
                rules={[{ required: true, message: "Confirm your password" }]}
              >
                <Input.Password autoComplete="new-password" placeholder="Type it again" />
              </Form.Item>
              <ul className="pw-rules" aria-label="Password rules">
                {PASSWORD_RULES.map((rule, i) => {
                  const ok = rule.test(password, confirmPassword);
                  // A mismatch shows red as soon as something is typed in the confirm field; other rules after a submit attempt.
                  const bad = !ok && (attempted || (i === MATCH_RULE && confirmPassword.length > 0));
                  return (
                    <li key={rule.label} className={ok ? "ok" : bad ? "bad" : undefined}>
                      <i aria-hidden>
                        {ok && (
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M8.2 13.4 4.8 10l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z" />
                          </svg>
                        )}
                        {bad && (
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4">
                            <path d="M6 6l8 8M14 6l-8 8" />
                          </svg>
                        )}
                      </i>
                      {rule.label}
                      <span className="sr-only">{ok ? " (done)" : bad ? " (not met)" : " (not yet)"}</span>
                    </li>
                  );
                })}
              </ul>
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
              We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{details.email.trim()}</b>. Enter it below to activate
              your company.
            </p>
            <Form className="af" layout="vertical" requiredMark={false} onFinish={handleVerify} style={{ marginTop: 24 }}>
              <Form.Item label="Verification code" validateStatus={codeError ? "error" : undefined}>
                <Input.OTP length={6} value={code} onChange={setCode} formatter={(v) => v.replace(/\D/g, "")} autoFocus />
              </Form.Item>
              <div className="resend" style={{ marginBottom: 18 }}>
                <span>The code expires in 30 minutes. You can also click the link in the email.</span>
                <button type="button" onClick={handleResend} disabled={resendIn > 0}>
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
              {resendMsg && (
                <p className="hint" style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
                  {resendMsg}
                </p>
              )}
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
              <b style={{ color: "var(--ink)" }}>{details?.companyName.trim()}</b> is ready. Log in as Admin to invite your
              partners.
            </p>
            <Link className="btn btn-dark btn-block" href="/login" style={{ marginTop: 24 }}>
              Log in
            </Link>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

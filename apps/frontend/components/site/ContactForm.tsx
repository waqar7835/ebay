"use client";

import { ContactTopic } from "@ebay-order-management/shared";
import { Alert, Button, Form, Input, Radio, Select } from "antd";
import { useState } from "react";
import { sendContactMessage } from "@/lib/api";
import { ROLE_COLORS } from "@/lib/brand";

const TOPICS = [
  { value: ContactTopic.SALES, label: "Sales", hint: "Plans and pricing", color: ROLE_COLORS.admin },
  { value: ContactTopic.SUPPORT, label: "Support", hint: "Using the app", color: ROLE_COLORS.threePl },
  { value: ContactTopic.BILLING, label: "Billing", hint: "Payments, receipts", color: ROLE_COLORS.stockOwner },
  { value: ContactTopic.OTHER, label: "Other", hint: "Anything else", color: ROLE_COLORS.accountHolder },
];

const ROLES = [
  "Company owner or Admin",
  "Staff member",
  "Account Holder",
  "Stock Owner",
  "3PL warehouse",
  "Not using it yet",
].map((r) => ({ value: r, label: r }));

interface ContactValues {
  topic: ContactTopic;
  name: string;
  email: string;
  company?: string;
  role: string;
  message: string;
  website?: string;
}

export default function ContactForm() {
  const [form] = Form.useForm<ContactValues>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ name: string; email: string } | null>(null);

  async function handleFinish(values: ContactValues) {
    setError(null);
    setSending(true);
    try {
      await sendContactMessage({ ...values, name: values.name.trim(), email: values.email.trim(), message: values.message.trim() });
      setSentTo({ name: values.name.trim().split(/\s+/)[0], email: values.email.trim() });
      form.resetFields();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message couldn't be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (sentTo) {
    return (
      <div className="form-card done">
        <div className="sent" role="status" aria-live="polite">
          <div className="ok">
            <svg width="28" height="28" viewBox="0 0 20 20" fill="#047857" aria-hidden>
              <path d="M8.2 13.4 4.8 10l1.1-1.1 2.3 2.3 5.9-5.9 1.1 1.1z" />
            </svg>
          </div>
          <h3>Message sent</h3>
          <p>
            Thanks, {sentTo.name}. We&apos;ll reply to {sentTo.email} within one working day.
          </p>
          <Button size="large" onClick={() => setSentTo(null)} style={{ marginTop: 22 }}>
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-card">
      <div className="intro">
        <h2>Send us a message</h2>
        <p>All fields except company are required.</p>
      </div>
      <Form<ContactValues>
        form={form}
        className="contact-form"
        layout="vertical"
        requiredMark={false}
        initialValues={{ topic: ContactTopic.SALES }}
        onFinish={handleFinish}
      >
        <Form.Item name="topic" label="What's it about?">
          <Radio.Group className="topics">
            {TOPICS.map((t) => (
              <Radio.Button key={t.value} value={t.value}>
                <i style={{ background: t.color }} />
                {t.label}
                <small>{t.hint}</small>
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>
        <div className="row">
          <Form.Item name="name" label="Your name" rules={[{ required: true, whitespace: true, min: 2, message: "Enter your name" }]}>
            <Input autoComplete="name" placeholder="Ayesha Khan" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email", message: "Enter a valid email" }]}>
            <Input autoComplete="email" placeholder="you@company.com" />
          </Form.Item>
        </div>
        <div className="row">
          <Form.Item name="company" label="Company (optional)">
            <Input autoComplete="organization" placeholder="Alpha Drop" />
          </Form.Item>
          <Form.Item name="role" label="I am a" rules={[{ required: true, message: "Choose what describes you best" }]}>
            <Select placeholder="Choose one" options={ROLES} />
          </Form.Item>
        </div>
        <Form.Item
          name="message"
          label="Message"
          rules={[{ required: true, whitespace: true, min: 20, message: "Write at least 20 characters so we can help" }]}
        >
          <Input.TextArea rows={6} placeholder="Tell us what you need. For an order or invoice, include its number." maxLength={5000} />
        </Form.Item>
        {/* Honeypot: hidden from people, bots fill it in. */}
        <Form.Item name="website" className="hp" aria-hidden>
          <Input tabIndex={-1} autoComplete="off" />
        </Form.Item>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16, borderRadius: 12 }} />}
        <div className="submit-row">
          <p>We only use your details to reply to this message.</p>
          <Button type="primary" htmlType="submit" loading={sending} size="large">
            Send message
          </Button>
        </div>
      </Form>
    </div>
  );
}

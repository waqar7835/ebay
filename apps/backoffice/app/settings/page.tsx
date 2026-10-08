"use client";

import { DeleteOutlined, MinusCircleOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import type { PlatformSettingsDto, ReplyHoursRow, UpdatePlatformSettingsInput } from "@ebay-order-management/shared";
import { Alert, App, Button, Card, Checkbox, Form, Input, InputNumber, Space, Switch, Tag, Upload } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import {
  getPlatformSettings,
  getStoredUser,
  getToken,
  mediaUrl,
  removePlatformFavicon,
  removePlatformLogo,
  sendTestEmail,
  updatePlatformSettings,
  uploadPlatformFavicon,
  uploadPlatformLogo,
} from "@/lib/api";

interface SettingsForm {
  brandName: string;
  helloEmail?: string;
  supportEmail?: string;
  contactEmail?: string;
  replyHours: ReplyHoursRow[];
  replyTimezone?: string;
  smtpHost?: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  mailFromName?: string;
  mailFromEmail?: string;
}

const orNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

function toForm(s: PlatformSettingsDto): SettingsForm {
  return {
    brandName: s.brandName,
    helloEmail: s.helloEmail ?? undefined,
    supportEmail: s.supportEmail ?? undefined,
    contactEmail: s.contactEmail ?? undefined,
    replyHours: s.replyHours,
    replyTimezone: s.replyTimezone ?? undefined,
    smtpHost: s.smtpHost ?? undefined,
    smtpPort: s.smtpPort,
    smtpSecure: s.smtpSecure,
    smtpUser: s.smtpUser ?? undefined,
    smtpPassword: undefined,
    clearSmtpPassword: false,
    mailFromName: s.mailFromName ?? undefined,
    mailFromEmail: s.mailFromEmail ?? undefined,
  };
}

/**
 * Super Admin: platform-wide settings stored in the database (platform_settings), not in env vars — the public
 * site's brand name, logo and contact details, where contact-form messages go, and the SMTP server for all email.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<SettingsForm>();
  const [settings, setSettings] = useState<PlatformSettingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  function apply(s: PlatformSettingsDto) {
    setSettings(s);
    form.setFieldsValue(toForm(s));
  }

  useEffect(() => {
    const user = getStoredUser();
    if (!getToken() || !user?.roles.includes("SUPER_ADMIN" as never)) {
      router.push("/");
      return;
    }
    if (user.email) setTestTo(user.email);
    getPlatformSettings()
      .then(apply)
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSave(values: SettingsForm) {
    setSaving(true);
    setError(null);
    try {
      const input: UpdatePlatformSettingsInput = {
        brandName: values.brandName.trim(),
        helloEmail: orNull(values.helloEmail),
        supportEmail: orNull(values.supportEmail),
        contactEmail: orNull(values.contactEmail),
        replyHours: (values.replyHours ?? []).filter((r) => r?.days?.trim() && r?.hours?.trim()),
        replyTimezone: orNull(values.replyTimezone),
        smtpHost: orNull(values.smtpHost),
        smtpPort: values.smtpPort,
        smtpSecure: values.smtpSecure,
        smtpUser: orNull(values.smtpUser),
        mailFromName: orNull(values.mailFromName),
        mailFromEmail: orNull(values.mailFromEmail),
        ...(values.clearSmtpPassword ? { clearSmtpPassword: true } : values.smtpPassword ? { smtpPassword: values.smtpPassword } : {}),
      };
      apply(await updatePlatformSettings(input));
      message.success("Settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogo(file: File) {
    setLogoBusy(true);
    try {
      apply(await uploadPlatformLogo(file));
      message.success("Logo updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Couldn't upload the logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleRemoveLogo() {
    setLogoBusy(true);
    try {
      apply(await removePlatformLogo());
      message.success("Logo removed");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Couldn't remove the logo");
    } finally {
      setLogoBusy(false);
    }
  }

  async function handleFavicon(file: File) {
    setFaviconBusy(true);
    try {
      apply(await uploadPlatformFavicon(file));
      message.success("Favicon updated");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Couldn't upload the favicon");
    } finally {
      setFaviconBusy(false);
    }
  }

  async function handleRemoveFavicon() {
    setFaviconBusy(true);
    try {
      apply(await removePlatformFavicon());
      message.success("Favicon removed — the logo is used instead");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Couldn't remove the favicon");
    } finally {
      setFaviconBusy(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendTestEmail(testTo.trim());
      setTestResult({ ok: true, text: res.message });
    } catch (err) {
      setTestResult({ ok: false, text: err instanceof Error ? err.message : "The test email failed" });
    } finally {
      setTesting(false);
    }
  }

  const passwordSet = settings?.smtpPasswordSet ?? false;

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform-wide settings for the public website and email. Saved in the database, so changes apply without a redeploy.
        </p>
        {error && <Alert type="error" title={error} className="mt-4" showIcon />}

        <Card className="mt-6" title="Logo" loading={!settings}>
          <div className="flex flex-wrap items-center gap-6">
            <div className="grid h-20 w-48 place-items-center rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2">
              {settings?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(settings.logoUrl)} alt="Current logo" className="max-h-16 max-w-full object-contain" />
              ) : (
                <span className="text-xs text-gray-400">No logo (the colored mark is shown)</span>
              )}
            </div>
            <Space wrap>
              <Upload
                accept="image/png,image/jpeg,image/webp"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleLogo(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={logoBusy}>
                  {settings?.logoUrl ? "Replace logo" : "Upload logo"}
                </Button>
              </Upload>
              {settings?.logoUrl && (
                <Button icon={<DeleteOutlined />} danger onClick={handleRemoveLogo} disabled={logoBusy}>
                  Remove
                </Button>
              )}
            </Space>
          </div>
          <p className="mt-3 text-xs text-gray-500">PNG (keeps transparency), JPEG or WebP, up to 2 MB. Shown next to the brand name on the public site.</p>
        </Card>

        <Card className="mt-4" title="Favicon" loading={!settings}>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex h-20 w-48 items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-2">
              {settings?.faviconUrl || settings?.logoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(settings.faviconUrl ?? settings.logoUrl)} alt="Current favicon" className="h-8 w-8 object-contain" />
                  {!settings.faviconUrl && <span className="text-xs text-gray-400">Using the logo</span>}
                </>
              ) : (
                <span className="text-xs text-gray-400">No favicon or logo yet</span>
              )}
            </div>
            <Space wrap>
              <Upload
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico,image/jpeg,image/webp"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleFavicon(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={faviconBusy}>
                  {settings?.faviconUrl ? "Replace favicon" : "Upload favicon"}
                </Button>
              </Upload>
              {settings?.faviconUrl && (
                <Button icon={<DeleteOutlined />} danger onClick={handleRemoveFavicon} disabled={faviconBusy}>
                  Remove
                </Button>
              )}
            </Space>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            The browser-tab icon for the public site, the portal and the backoffice. PNG or ICO (square, e.g. 64×64), JPEG or WebP, up to 1 MB.
            Without one, the logo above is used.
          </p>
        </Card>

        <Form<SettingsForm> form={form} layout="vertical" onFinish={handleSave} disabled={!settings} className="mt-4">
          <Card title="Brand and public contact details">
            <Form.Item name="brandName" label="Brand name" rules={[{ required: true, whitespace: true, message: "Enter the brand name" }, { max: 60 }]}>
              <Input placeholder="OrderSplit" />
            </Form.Item>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Form.Item name="helloEmail" label="Sales and general email" extra="Shown on the Contact page and in the footer." rules={[{ type: "email", message: "Enter a valid email" }]}>
                <Input placeholder="hello@yourdomain.com" />
              </Form.Item>
              <Form.Item name="supportEmail" label="Support and billing email" extra="Shown on the Contact page." rules={[{ type: "email", message: "Enter a valid email" }]}>
                <Input placeholder="support@yourdomain.com" />
              </Form.Item>
            </div>
            <Form.Item label="Reply hours" extra="Shown on the Contact page. Leave empty to hide the box.">
              <Form.List name="replyHours">
                {(fields, { add, remove }) => (
                  <div className="flex flex-col gap-2">
                    {fields.map((field) => (
                      <div key={field.key} className="flex items-start gap-2">
                        <Form.Item name={[field.name, "days"]} className="mb-0 flex-1" rules={[{ required: true, message: "Days" }]}>
                          <Input placeholder="Monday to Friday" />
                        </Form.Item>
                        <Form.Item name={[field.name, "hours"]} className="mb-0 flex-1" rules={[{ required: true, message: "Hours" }]}>
                          <Input placeholder="10:00 to 19:00" />
                        </Form.Item>
                        <Button type="text" icon={<MinusCircleOutlined />} aria-label="Remove row" onClick={() => remove(field.name)} />
                      </div>
                    ))}
                    <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ days: "", hours: "" })} disabled={fields.length >= 10}>
                      Add row
                    </Button>
                  </div>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item name="replyTimezone" label="Time zone label" className="mb-0">
              <Input placeholder="Pakistan Standard Time (PKT)" />
            </Form.Item>
          </Card>

          <Card className="mt-4" title="Contact form">
            <Form.Item
              name="contactEmail"
              label="Send contact-form messages to"
              className="mb-0"
              extra="Not shown publicly. Leave empty and messages are only written to the server log."
              rules={[{ type: "email", message: "Enter a valid email" }]}
            >
              <Input placeholder="inbox@yourdomain.com" />
            </Form.Item>
          </Card>

          <Card
            className="mt-4"
            title="Email delivery (SMTP)"
            extra={settings && (settings.emailDelivery === "smtp" ? <Tag color="green">Sending via SMTP</Tag> : <Tag>Only logging emails</Tag>)}
          >
            <p className="mb-4 text-sm text-gray-500">
              Used for every email the platform sends: verification codes, invites, password resets, subscription reminders and
              contact-form messages. Without a host, emails are only written to the server log.
            </p>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-[1fr_140px]">
              <Form.Item name="smtpHost" label="SMTP host">
                <Input placeholder="smtp.yourprovider.com" />
              </Form.Item>
              <Form.Item name="smtpPort" label="Port" rules={[{ required: true, message: "Port" }]}>
                <InputNumber min={1} max={65535} className="w-full" />
              </Form.Item>
            </div>
            <Form.Item name="smtpSecure" label="Use TLS from the start" valuePropName="checked" extra="On for port 465. Off for 587, which upgrades with STARTTLS.">
              <Switch />
            </Form.Item>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Form.Item name="smtpUser" label="Username">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="smtpPassword"
                label="Password"
                extra={passwordSet ? "A password is saved. Leave empty to keep it." : "Stored encrypted. Never shown again after saving."}
              >
                <Input.Password autoComplete="new-password" placeholder={passwordSet ? "••••••••  (saved)" : ""} />
              </Form.Item>
            </div>
            {passwordSet && (
              <Form.Item name="clearSmtpPassword" valuePropName="checked">
                <Checkbox>Remove the saved password</Checkbox>
              </Form.Item>
            )}
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Form.Item name="mailFromName" label="Sender name" extra="Defaults to the brand name.">
                <Input placeholder="OrderSplit" />
              </Form.Item>
              <Form.Item name="mailFromEmail" label="Sender email" extra="Defaults to the username." rules={[{ type: "email", message: "Enter a valid email" }]} className="mb-0">
                <Input placeholder="no-reply@yourdomain.com" />
              </Form.Item>
            </div>
          </Card>

          <div className="mt-4 flex justify-end">
            <Button type="primary" htmlType="submit" loading={saving} size="large">
              Save settings
            </Button>
          </div>
        </Form>

        <Card className="mt-6" title="Send a test email">
          <p className="mb-3 text-sm text-gray-500">Uses the saved SMTP settings. Save your changes first.</p>
          <Space.Compact className="w-full max-w-md">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourdomain.com" />
            <Button type="primary" onClick={handleTest} loading={testing} disabled={!testTo.trim()}>
              Send test
            </Button>
          </Space.Compact>
          {testResult && <Alert className="mt-3" type={testResult.ok ? "success" : "error"} title={testResult.text} showIcon />}
        </Card>
      </main>
    </>
  );
}

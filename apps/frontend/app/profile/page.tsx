"use client";

import type { CompanyDto, UserDto } from "@ebay-order-management/shared";
import { Alert, Avatar, Button, Card, Descriptions, Divider, Form, Image, Input, Select, Tag } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import ImageUpload from "@/components/ImageUpload";
import {
  changeMyPassword,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  updateCompanyBillingAnchorDay,
  updateCompanyName,
  updateMyProfile,
  uploadCompanyLogo,
} from "@/lib/api";

const BILLING_ANCHOR_DAY_OPTIONS = [1, 5, 10, 15, 20, 25, 30];

export default function ProfilePage() {
  const router = useRouter();
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.roles.includes("ADMIN" as never) ?? false;

  const [user, setUser] = useState<UserDto | null>(null);
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [billingAnchorDay, setBillingAnchorDay] = useState(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [passwordForm] = Form.useForm<{ currentPassword: string; newPassword: string; confirmNewPassword: string }>();
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function load() {
    getMyProfile()
      .then((u) => {
        setUser(u);
        setName(u.name ?? "");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load profile"));
    getMyCompany()
      .then((c) => {
        setCompany(c);
        setCompanyName(c.name);
        setBillingAnchorDay(c.billingAnchorDay);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load company"));
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleSave() {
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      if (logoFile) {
        const updated = await uploadCompanyLogo(logoFile);
        setCompany(updated);
        setLogoFile(null);
      }
      if (name !== (user?.name ?? "")) {
        const updated = await updateMyProfile({ name });
        setUser(updated);
      }
      if (isAdmin && company && companyName !== company.name) {
        const updated = await updateCompanyName(companyName);
        setCompany(updated);
      }
      if (isAdmin && company && billingAnchorDay !== company.billingAnchorDay) {
        const updated = await updateCompanyBillingAnchorDay(billingAnchorDay);
        setCompany(updated);
      }
      setSaveMessage("Profile saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(values: { currentPassword: string; newPassword: string; confirmNewPassword: string }) {
    setPasswordError(null);
    setPasswordMessage(null);
    setPasswordSaving(true);
    try {
      await changeMyPassword(values.currentPassword, values.newPassword, values.confirmNewPassword);
      setPasswordMessage("Password updated");
      passwordForm.resetFields();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  const yesNo = (v: boolean) => (v ? "Yes" : "No");
  const setByAdmin = <p className="mb-3 text-xs text-gray-500">Set by an admin — contact them to make changes.</p>;

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8 pb-16">
        <h1 className="text-2xl font-semibold">Profile</h1>
        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        <Card className="mt-6" title="Your details">
          <Form layout="vertical" onFinish={handleSave}>
            <Form.Item label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </Form.Item>
            <Form.Item label="Email">
              <Input value={user?.email ?? ""} disabled />
            </Form.Item>
            <Form.Item label="Roles">
              <div>
                {user?.roles.map((r) => (
                  <Tag key={r}>{r}</Tag>
                ))}
              </div>
            </Form.Item>

            {user?.staffProfile && (
              <>
                <Divider titlePlacement="start">Staff permissions</Divider>
                {setByAdmin}
                <Descriptions size="small" column={2} bordered className="mb-4">
                  <Descriptions.Item label="Manage orders">{yesNo(user.staffProfile.canManageOrders)}</Descriptions.Item>
                  <Descriptions.Item label="Manage stock">{yesNo(user.staffProfile.canManageStock)}</Descriptions.Item>
                  <Descriptions.Item label="Manage users">{yesNo(user.staffProfile.canManageUsers)}</Descriptions.Item>
                  <Descriptions.Item label="Generate invoices">{yesNo(user.staffProfile.canGenerateInvoices)}</Descriptions.Item>
                  <Descriptions.Item label="View financials">{yesNo(user.staffProfile.canViewFinancials)}</Descriptions.Item>
                  <Descriptions.Item label="Revenue share">
                    {user.staffProfile.hasRevenueShare ? `${user.staffProfile.sharePercent ?? 0}%` : "No"}
                  </Descriptions.Item>
                </Descriptions>
              </>
            )}

            {user?.accountHolderProfile && (
              <>
                <Divider titlePlacement="start">Account Holder settings</Divider>
                {setByAdmin}
                <Descriptions size="small" column={2} bordered className="mb-4">
                  <Descriptions.Item label="Share % of profit">{user.accountHolderProfile.sharePercent}%</Descriptions.Item>
                  <Descriptions.Item label="3PL price charged">{user.accountHolderProfile.threePlPriceCharged ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle start day">{user.accountHolderProfile.billingCycleStartDay}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {user?.stockOwnerProfile && (
              <>
                <Divider titlePlacement="start">Stock Owner settings</Divider>
                {setByAdmin}
                <Descriptions size="small" column={2} bordered className="mb-4">
                  <Descriptions.Item label="Payout mode">{user.stockOwnerProfile.payoutMode}</Descriptions.Item>
                  <Descriptions.Item label="Share % of margin">{user.stockOwnerProfile.sharePercent ?? "—"}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle start day">{user.stockOwnerProfile.billingCycleStartDay}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {user?.threePlProfile && (
              <>
                <Divider titlePlacement="start">3PL settings</Divider>
                {setByAdmin}
                <Descriptions size="small" column={2} bordered className="mb-4">
                  <Descriptions.Item label="Type">{user.threePlProfile.fulfillmentType}</Descriptions.Item>
                  <Descriptions.Item label="Payout per order">{user.threePlProfile.payoutPerOrder}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle start day">{user.threePlProfile.billingCycleStartDay}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            <Divider titlePlacement="start">Company</Divider>
            <Form.Item label="Company name">
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!isAdmin} />
            </Form.Item>

            <Form.Item label="Logo">
              {isAdmin ? (
                <ImageUpload value={logoFile} existingUrl={company?.logoUrl ?? null} onChange={setLogoFile} freeAspect />
              ) : company?.logoUrl ? (
                <Image src={company.logoUrl} alt="Company logo" width={80} height={80} className="rounded border object-contain" />
              ) : (
                <Avatar shape="square" size={80}>
                  No logo
                </Avatar>
              )}
            </Form.Item>

            <Form.Item label="Billing anchor day">
              <Select
                value={billingAnchorDay}
                onChange={(v) => setBillingAnchorDay(v)}
                disabled={!isAdmin}
                options={BILLING_ANCHOR_DAY_OPTIONS.map((day) => ({ value: day, label: String(day) }))}
              />
            </Form.Item>

            {saveError && <Alert type="error" title={saveError} className="mb-4" showIcon />}
            {saveMessage && <Alert type="success" title={saveMessage} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </Form>
        </Card>

        <Card className="mt-8" title="Change password">
          <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
            <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="newPassword" label="New password" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="confirmNewPassword" label="Confirm new password" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            {passwordError && <Alert type="error" title={passwordError} className="mb-4" showIcon />}
            {passwordMessage && <Alert type="success" title={passwordMessage} className="mb-4" showIcon />}
            <Button type="primary" htmlType="submit" loading={passwordSaving}>
              {passwordSaving ? "Saving..." : "Change password"}
            </Button>
          </Form>
        </Card>
      </main>
    </>
  );
}

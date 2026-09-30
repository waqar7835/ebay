"use client";

import { DEFAULT_CURRENCY, type CompanyDto, type Currency, type UserDto } from "@ebay-order-management/shared";
import { LockOutlined, MailOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Avatar, Button, Card, Descriptions, Form, Image, Input, Select, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import RoleTag from "@/components/RoleTag";
import ImageUpload from "@/components/ImageUpload";
import {
  changeMyPassword,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  mediaUrl,
  updateCompanyBillingAnchorDay,
  updateCompanyDefaultCurrency,
  updateCompanyName,
  updateMyProfile,
  uploadCompanyLogo,
} from "@/lib/api";
import { currencyOptions, money as formatMoney } from "@/lib/currency";

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
  const [defaultCurrency, setDefaultCurrency] = useState<Currency>(DEFAULT_CURRENCY);
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
        setDefaultCurrency(c.defaultCurrency ?? DEFAULT_CURRENCY);
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
    if (saving) return;
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
      if (isAdmin && company && defaultCurrency !== company.defaultCurrency) {
        const updated = await updateCompanyDefaultCurrency(defaultCurrency);
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

  const yesNo = (v: boolean) => (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>);
  // Terms are in the user's own currency.
  const money = (v: number | null | undefined) => formatMoney(v, user?.currency);
  const currencyItem = user && <Descriptions.Item label="Currency">{user.currency}</Descriptions.Item>;
  const percent = (v: number | null | undefined) => (v != null ? `${v}%` : "—");
  const displayName = user?.name || user?.email || "";
  const initials =
    displayName
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  const lockedTag = (
    <Tooltip title="Set by an admin — contact them to make changes">
      <Tag icon={<LockOutlined />} className="mr-0">
        Set by admin
      </Tag>
    </Tooltip>
  );
  const settingsColumns = { xs: 1, sm: 2 };

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-6xl p-8 pb-16">
        <h1 className="text-2xl font-semibold">Profile</h1>
        {loadError && <Alert type="error" title={loadError} className="mt-4" showIcon />}

        <div className="profile-hero mt-6 flex flex-wrap items-center gap-5 rounded-2xl p-6">
          <Avatar size={72} className="profile-hero-avatar shrink-0 text-2xl font-semibold">
            {initials}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xl font-semibold text-white">{user?.name || "Your profile"}</div>
            <div className="truncate text-white/85">{user?.email}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {user?.roles.map((r) => (
                <RoleTag key={r} role={r} />
              ))}
            </div>
          </div>
          {company && (
            <div className="flex items-center gap-3 rounded-xl bg-white/85 px-4 py-3 shadow-sm">
              {company.logoUrl ? (
                <img src={mediaUrl(company.logoUrl)} alt="" className="h-10 w-10 rounded-lg object-contain" />
              ) : (
                <Avatar shape="square" size={40} icon={<ShopOutlined />} />
              )}
              <div>
                <div className="text-xs text-slate-500">Company</div>
                <div className="font-semibold text-slate-800">{company.name}</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Form layout="vertical" component={false}>
              <Card
                title={
                  <span>
                    <UserOutlined className="mr-2 text-slate-400" />
                    Your details
                  </span>
                }
              >
                <div className="grid gap-x-4 sm:grid-cols-2">
                  <Form.Item label="Name" className="mb-0">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                  </Form.Item>
                  <Form.Item label="Email" tooltip="Your sign-in email can't be changed here" className="mb-0">
                    <Input value={user?.email ?? ""} disabled prefix={<MailOutlined className="text-slate-400" />} />
                  </Form.Item>
                </div>
              </Card>

              <Card
                title={
                  <span>
                    <ShopOutlined className="mr-2 text-slate-400" />
                    Company
                  </span>
                }
                extra={!isAdmin && lockedTag}
              >
                <div className="flex flex-col gap-6 sm:flex-row">
                  <Form.Item label="Logo" className="mb-0 shrink-0">
                    {isAdmin ? (
                      <ImageUpload value={logoFile} existingUrl={company?.logoUrl ? mediaUrl(company.logoUrl) : null} onChange={setLogoFile} freeAspect />
                    ) : company?.logoUrl ? (
                      <Image src={mediaUrl(company.logoUrl)} alt="Company logo" width={104} height={104} className="rounded-lg border object-contain" />
                    ) : (
                      <Avatar shape="square" size={104} icon={<ShopOutlined />} />
                    )}
                  </Form.Item>
                  <div className="grid flex-1 content-start gap-x-4 sm:grid-cols-2">
                    <Form.Item label="Company name" className="sm:col-span-2">
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={!isAdmin} />
                    </Form.Item>
                    <Form.Item
                      label="Billing anchor day"
                      tooltip="Day of the month each billing cycle starts, unless a user has their own"
                      className="mb-0"
                    >
                      <Select
                        value={billingAnchorDay}
                        onChange={(v) => setBillingAnchorDay(v)}
                        disabled={!isAdmin}
                        options={BILLING_ANCHOR_DAY_OPTIONS.map((day) => ({ value: day, label: `Day ${day}` }))}
                      />
                    </Form.Item>
                    <Form.Item
                      label="Default currency"
                      tooltip="Preselected when inviting Account Holders, Stock Owners and 3PLs. Existing users keep their own currency"
                      className="mb-0"
                    >
                      <Select
                        value={defaultCurrency}
                        onChange={setDefaultCurrency}
                        disabled={!isAdmin}
                        options={currencyOptions}
                        showSearch={{ optionFilterProp: "label" }}
                      />
                    </Form.Item>
                  </div>
                </div>
              </Card>
            </Form>

            {user?.staffProfile && (
              <Card title="Staff permissions" extra={lockedTag}>
                <Descriptions size="small" column={settingsColumns} bordered>
                  <Descriptions.Item label="Manage orders">{yesNo(user.staffProfile.canManageOrders)}</Descriptions.Item>
                  <Descriptions.Item label="Manage stock">{yesNo(user.staffProfile.canManageStock)}</Descriptions.Item>
                  <Descriptions.Item label="Manage users">{yesNo(user.staffProfile.canManageUsers)}</Descriptions.Item>
                  <Descriptions.Item label="Generate invoices">{yesNo(user.staffProfile.canGenerateInvoices)}</Descriptions.Item>
                  <Descriptions.Item label="View financials">{yesNo(user.staffProfile.canViewFinancials)}</Descriptions.Item>
                  <Descriptions.Item label="Revenue share">
                    {user.staffProfile.hasRevenueShare ? percent(user.staffProfile.sharePercent ?? 0) : "No"}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {user?.accountHolderProfile && (
              <Card title="Account Holder terms" extra={lockedTag}>
                <Descriptions size="small" column={settingsColumns} bordered>
                  <Descriptions.Item label="Share of profit">{percent(user.accountHolderProfile.sharePercent)}</Descriptions.Item>
                  <Descriptions.Item label="3PL price charged">{money(user.accountHolderProfile.threePlPriceCharged)}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle starts">Day {user.accountHolderProfile.billingCycleStartDay}</Descriptions.Item>
                  {currencyItem}
                </Descriptions>
              </Card>
            )}

            {user?.stockOwnerProfile && (
              <Card title="Stock Owner terms" extra={lockedTag}>
                <Descriptions size="small" column={settingsColumns} bordered>
                  <Descriptions.Item label="Payout mode">
                    {user.stockOwnerProfile.payoutMode === "PROFIT_SHARE" ? "Profit share" : "Fixed"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Share of margin">{percent(user.stockOwnerProfile.sharePercent)}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle starts">Day {user.stockOwnerProfile.billingCycleStartDay}</Descriptions.Item>
                  {currencyItem}
                </Descriptions>
              </Card>
            )}

            {user?.threePlProfile && (
              <Card title="3PL terms" extra={lockedTag}>
                <Descriptions size="small" column={settingsColumns} bordered>
                  <Descriptions.Item label="Fulfillment">
                    {user.threePlProfile.fulfillmentType === "DROPSHIP" ? "Dropshipping" : "Stock"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Payout per order">{money(user.threePlProfile.payoutPerOrder)}</Descriptions.Item>
                  <Descriptions.Item label="Billing cycle starts">Day {user.threePlProfile.billingCycleStartDay}</Descriptions.Item>
                  {currencyItem}
                </Descriptions>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <p className="mb-4 mt-0 text-sm text-slate-500">Saves your name{isAdmin ? " and the company settings" : ""}.</p>
              {saveError && <Alert type="error" title={saveError} className="mb-4" showIcon />}
              {saveMessage && <Alert type="success" title={saveMessage} className="mb-4" showIcon />}
              <Button type="primary" onClick={handleSave} loading={saving} block size="large">
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </Card>

            <Card
              title={
                <span>
                  <LockOutlined className="mr-2 text-slate-400" />
                  Change password
                </span>
              }
            >
              <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
                <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item name="newPassword" label="New password" rules={[{ required: true }]}>
                  <Input.Password />
                </Form.Item>
                <Form.Item
                  name="confirmNewPassword"
                  label="Confirm new password"
                  dependencies={["newPassword"]}
                  rules={[
                    { required: true },
                    ({ getFieldValue }) => ({
                      validator: (_, v) =>
                        !v || v === getFieldValue("newPassword") ? Promise.resolve() : Promise.reject(new Error("Passwords don't match")),
                    }),
                  ]}
                >
                  <Input.Password />
                </Form.Item>
                {passwordError && <Alert type="error" title={passwordError} className="mb-4" showIcon />}
                {passwordMessage && <Alert type="success" title={passwordMessage} className="mb-4" showIcon />}
                <Button htmlType="submit" loading={passwordSaving} block>
                  {passwordSaving ? "Saving..." : "Change password"}
                </Button>
              </Form>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}

"use client";

import type { CompanyDto, UserDto } from "@ebay-order-management/shared";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/Nav";
import {
  changeMyPassword,
  getMyCompany,
  getMyProfile,
  getStoredUser,
  getToken,
  updateCompanyName,
  updateMyProfile,
  uploadCompanyLogo,
} from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.roles.includes("ADMIN" as never) ?? false;

  const [user, setUser] = useState<UserDto | null>(null);
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [companySaving, setCompanySaving] = useState(false);
  const [companyMessage, setCompanyMessage] = useState<string | null>(null);
  const [companyError, setCompanyError] = useState<string | null>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
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

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setNameMessage(null);
    setNameSaving(true);
    try {
      const updated = await updateMyProfile({ name });
      setUser(updated);
      setNameMessage("Saved");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleSaveCompanyName(e: React.FormEvent) {
    e.preventDefault();
    setCompanyError(null);
    setCompanyMessage(null);
    setCompanySaving(true);
    try {
      const updated = await updateCompanyName(companyName);
      setCompany(updated);
      setCompanyMessage("Saved");
    } catch (err) {
      setCompanyError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setCompanySaving(false);
    }
  }

  async function handleUploadLogo(e: React.FormEvent) {
    e.preventDefault();
    if (!logoFile) return;
    setLogoError(null);
    setLogoUploading(true);
    try {
      const updated = await uploadCompanyLogo(logoFile);
      setCompany(updated);
      setLogoFile(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);
    setPasswordSaving(true);
    try {
      await changeMyPassword(currentPassword, newPassword, confirmNewPassword);
      setPasswordMessage("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Profile</h1>
        {loadError && <p className="mt-4 text-sm text-red-600">{loadError}</p>}

        <section className="mt-8 rounded border p-6">
          <h2 className="text-lg font-medium">Your details</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-gray-600">
            <dt>Email</dt>
            <dd>{user?.email}</dd>
            <dt>Status</dt>
            <dd>{user?.status}</dd>
            <dt>Roles</dt>
            <dd>{user?.roles.join(", ")}</dd>
          </dl>

          <form onSubmit={handleSaveName} className="mt-4 flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-700">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full rounded border px-3 py-2"
              />
            </label>
            {nameError && <p className="text-sm text-red-600">{nameError}</p>}
            {nameMessage && <p className="text-sm text-green-600">{nameMessage}</p>}
            <button
              type="submit"
              disabled={nameSaving}
              className="self-start rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {nameSaving ? "Saving..." : "Save name"}
            </button>
          </form>
        </section>

        <section className="mt-8 rounded border p-6">
          <h2 className="text-lg font-medium">Company</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-gray-600">
            <dt>Verified</dt>
            <dd>{company?.emailVerifiedAt ? "Yes" : "No"}</dd>
            <dt>Billing anchor day</dt>
            <dd>{company?.billingAnchorDay}</dd>
          </dl>

          <div className="mt-4 flex items-center gap-4">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt="Company logo" className="h-16 w-16 rounded border object-contain" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded border text-xs text-gray-400">
                No logo
              </div>
            )}
            {isAdmin && (
              <form onSubmit={handleUploadLogo} className="flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
                {logoError && <p className="text-sm text-red-600">{logoError}</p>}
                <button
                  type="submit"
                  disabled={!logoFile || logoUploading}
                  className="self-start rounded border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {logoUploading ? "Uploading..." : "Upload logo"}
                </button>
              </form>
            )}
          </div>

          {isAdmin ? (
            <form onSubmit={handleSaveCompanyName} className="mt-4 flex flex-col gap-3">
              <label className="text-sm font-medium text-gray-700">
                Company name
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              {companyError && <p className="text-sm text-red-600">{companyError}</p>}
              {companyMessage && <p className="text-sm text-green-600">{companyMessage}</p>}
              <button
                type="submit"
                disabled={companySaving}
                className="self-start rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {companySaving ? "Saving..." : "Save company name"}
              </button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-gray-600">Company name: {company?.name}</p>
          )}
        </section>

        <section className="mt-8 rounded border p-6">
          <h2 className="text-lg font-medium">Change password</h2>
          <form onSubmit={handleChangePassword} className="mt-4 flex flex-col gap-3">
            <input
              type="password"
              placeholder="Current password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="rounded border px-3 py-2"
            />
            <input
              type="password"
              placeholder="New password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded border px-3 py-2"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              required
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="rounded border px-3 py-2"
            />
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordMessage && <p className="text-sm text-green-600">{passwordMessage}</p>}
            <button
              type="submit"
              disabled={passwordSaving}
              className="self-start rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {passwordSaving ? "Saving..." : "Change password"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

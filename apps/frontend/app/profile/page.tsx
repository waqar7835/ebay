"use client";

import type { CompanyDto, UserDto } from "@ebay-order-management/shared";
import { useEffect, useRef, useState } from "react";
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

const inputClass = "mt-1 w-full rounded border px-3 py-2";
const disabledInputClass = `${inputClass} bg-gray-50 text-gray-500`;
const labelClass = "text-sm font-medium text-gray-700";

export default function ProfilePage() {
  const router = useRouter();
  const storedUser = getStoredUser();
  const isAdmin = storedUser?.roles.includes("ADMIN" as never) ?? false;

  const [user, setUser] = useState<UserDto | null>(null);
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Preview the newly-picked file locally; fall back to the saved logo otherwise.
  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    setSaveMessage(null);
    setSaving(true);
    try {
      if (logoFile) {
        const updated = await uploadCompanyLogo(logoFile);
        setCompany(updated);
        setLogoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
      if (name !== (user?.name ?? "")) {
        const updated = await updateMyProfile({ name });
        setUser(updated);
      }
      if (isAdmin && company && companyName !== company.name) {
        const updated = await updateCompanyName(companyName);
        setCompany(updated);
      }
      setSaveMessage("Profile saved");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
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

  const displayLogo = logoPreview ?? company?.logoUrl ?? null;

  return (
    <>
      <Nav />
      <main className="ml-56 max-w-2xl p-8 pb-16">
        <h1 className="text-2xl font-semibold">Profile</h1>
        {loadError && <p className="mt-4 text-sm text-red-600">{loadError}</p>}

        <form onSubmit={handleSave} className="mt-6 rounded border p-6">
          <h2 className="text-lg font-medium">Your details</h2>
          <div className="mt-4 flex flex-col gap-4">
            <label className={labelClass}>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Email
              <input value={user?.email ?? ""} disabled className={disabledInputClass} />
            </label>

            <label className={labelClass}>
              Status
              <input value={user?.status ?? ""} disabled className={disabledInputClass} />
            </label>

            <label className={labelClass}>
              Roles
              <input value={user?.roles.join(", ") ?? ""} disabled className={disabledInputClass} />
            </label>
          </div>

          <h2 className="mt-8 text-lg font-medium">Company</h2>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <span className={labelClass}>Logo</span>
              <div className="mt-1 flex items-center gap-4">
                {displayLogo ? (
                  <img src={displayLogo} alt="Company logo preview" className="h-20 w-20 rounded border object-contain" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded border text-xs text-gray-400">
                    No logo
                  </div>
                )}
                {isAdmin && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    className="text-sm"
                  />
                )}
              </div>
            </div>

            <label className={labelClass}>
              Company name
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isAdmin}
                className={isAdmin ? inputClass : disabledInputClass}
              />
            </label>

            <label className={labelClass}>
              Verified
              <input value={company?.emailVerifiedAt ? "Yes" : "No"} disabled className={disabledInputClass} />
            </label>

            <label className={labelClass}>
              Billing anchor day
              <input value={company?.billingAnchorDay ?? ""} disabled className={disabledInputClass} />
            </label>
          </div>

          {saveError && <p className="mt-4 text-sm text-red-600">{saveError}</p>}
          {saveMessage && <p className="mt-4 text-sm text-green-600">{saveMessage}</p>}
          <button
            type="submit"
            disabled={saving}
            className="mt-6 rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>

        <form onSubmit={handleChangePassword} className="mt-8 rounded border p-6">
          <h2 className="text-lg font-medium">Change password</h2>
          <div className="mt-4 flex flex-col gap-4">
            <label className={labelClass}>
              Current password
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              New password
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Confirm new password
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
          {passwordError && <p className="mt-4 text-sm text-red-600">{passwordError}</p>}
          {passwordMessage && <p className="mt-4 text-sm text-green-600">{passwordMessage}</p>}
          <button
            type="submit"
            disabled={passwordSaving}
            className="mt-6 rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {passwordSaving ? "Saving..." : "Change password"}
          </button>
        </form>
      </main>
    </>
  );
}

"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Card, Skeleton } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface ProfileData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  hasPassword: boolean;
  createdAt: string;
  counts: { links: number; apiKeys: number; webhooks: number };
}

export function SettingsClient() {
  const { toast } = useToast();
  const [profile, setProfile] = React.useState<ProfileData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [name, setName] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);

  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setProfile(json.data);
          setName(json.data.name ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "profile", name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast({ kind: "error", title: json?.error?.message || "Failed to update profile" });
        return;
      }
      toast({ kind: "success", title: "Profile updated" });
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "password",
          currentPassword,
          newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast({ kind: "error", title: json?.error?.message || "Failed to update password" });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      toast({ kind: "success", title: "Password changed" });
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== "DELETE") {
      toast({ kind: "error", title: "Type DELETE to confirm" });
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation: "DELETE",
          ...(profile?.hasPassword ? { currentPassword: deletePassword } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast({ kind: "error", title: json?.error?.message || "Failed to delete account" });
        return;
      }
      await signOut({ callbackUrl: "/" });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account Settings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Manage your profile, security credentials, and account lifecycle.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Signed in as {profile?.email} • {profile?.counts.links ?? 0} links
        </p>
        <form onSubmit={saveProfile} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="settings-name" className="block text-xs font-medium">
              Display name
            </label>
            <Input
              id="settings-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={savingName}>
            {savingName ? "Saving..." : "Save profile"}
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold">Change Password</h2>
        <form onSubmit={savePassword} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cur-pw" className="block text-xs font-medium">
              Current password
            </label>
            <Input
              id="cur-pw"
              type="password"
              required={Boolean(profile?.hasPassword)}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="new-pw" className="block text-xs font-medium">
              New password (min 8 chars)
            </label>
            <Input
              id="new-pw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={savingPassword}>
              {savingPassword ? "Updating..." : "Update password"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-rose-200 p-6 dark:border-rose-900/60">
        <h2 className="text-base font-semibold text-rose-700 dark:text-rose-400">
          Danger Zone
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Deleting your account permanently removes all your short links, analytics events, API keys, and webhooks.
        </p>
        <form onSubmit={handleDeleteAccount} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="del-confirm" className="block text-xs font-medium">
              Type DELETE to confirm
            </label>
            <Input
              id="del-confirm"
              required
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="mt-1"
            />
          </div>
          {profile?.hasPassword && (
            <div>
              <label htmlFor="del-pw" className="block text-xs font-medium">
                Current password
              </label>
              <Input
                id="del-pw"
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="mt-1"
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" variant="danger" disabled={deleting}>
              {deleting ? "Deleting..." : "Delete account permanently"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

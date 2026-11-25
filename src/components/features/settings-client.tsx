"use client";

import * as React from "react";
import { signOut } from "next-auth/react";
import { Copy, KeyRound, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";
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

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  lastUsedAt: string | null;
}

interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  deliveriesCount: number;
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

  const [apiKeys, setApiKeys] = React.useState<ApiKeyItem[]>([]);
  const [keyName, setKeyName] = React.useState("");
  const [newRawKey, setNewRawKey] = React.useState<string | null>(null);

  const [webhooks, setWebhooks] = React.useState<WebhookItem[]>([]);
  const [hookUrl, setHookUrl] = React.useState("");
  const [newHookSecret, setNewHookSecret] = React.useState<string | null>(null);

  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [deletePassword, setDeletePassword] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const loadDeveloperSettings = React.useCallback(async () => {
    const [keysRes, hooksRes] = await Promise.all([
      fetch("/api/keys").then((r) => r.json()),
      fetch("/api/webhooks").then((r) => r.json()),
    ]);
    if (keysRes?.data) setApiKeys(keysRes.data);
    if (hooksRes?.data) setWebhooks(hooksRes.data);
  }, []);

  React.useEffect(() => {
    Promise.all([
      fetch("/api/account").then((r) => r.json()),
      fetch("/api/keys").then((r) => r.json()),
      fetch("/api/webhooks").then((r) => r.json()),
    ])
      .then(([acc, keys, hooks]) => {
        if (acc?.data) {
          setProfile(acc.data);
          setName(acc.data.name ?? "");
        }
        if (keys?.data) setApiKeys(keys.data);
        if (hooks?.data) setWebhooks(hooks.data);
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

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: keyName.trim(),
        scopes: ["links:read", "links:write", "analytics:read"],
      }),
    });
    const json = await res.json();
    if (res.ok && json.data) {
      setNewRawKey(json.data.rawKey);
      setKeyName("");
      toast({ kind: "success", title: "API key created" });
      void loadDeveloperSettings();
    } else {
      toast({ kind: "error", title: json?.error?.message || "Failed to create key" });
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    toast({ kind: "info", title: "API key revoked" });
    void loadDeveloperSettings();
  }

  async function createWebhook(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: hookUrl.trim(),
        events: ["click.milestone", "link.expired"],
      }),
    });
    const json = await res.json();
    if (res.ok && json.data) {
      setNewHookSecret(json.data.secret);
      setHookUrl("");
      toast({ kind: "success", title: "Webhook created" });
      void loadDeveloperSettings();
    } else {
      toast({ kind: "error", title: json?.error?.message || "Failed to create webhook" });
    }
  }

  async function deleteWebhook(id: string) {
    await fetch(`/api/webhooks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    toast({ kind: "info", title: "Webhook deleted" });
    void loadDeveloperSettings();
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
          Manage your profile, API keys, webhooks, security credentials, and account lifecycle.
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

      {/* API Keys */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold">API Keys</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Authenticate REST requests using <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>.
        </p>

        <form onSubmit={createKey} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            required
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="CI / Production key"
          />
          <Button type="submit">Generate API key</Button>
        </form>

        {newRawKey && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <code className="truncate font-mono">{newRawKey}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(newRawKey);
                toast({ kind: "info", title: "API key copied" });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {apiKeys.length === 0 ? (
            <p className="text-xs text-zinc-500">No active API keys.</p>
          ) : (
            apiKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
              >
                <div>
                  <span className="font-medium">{k.name}</span>{" "}
                  <code className="ml-1 text-zinc-500">{k.keyPrefix}…</code>
                  <div className="mt-1 flex gap-1">
                    {k.scopes.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => revokeKey(k.id)} aria-label="Revoke API key">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Webhooks */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <WebhookIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold">Webhooks</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Receive HMAC-SHA256 signed <code className="font-mono">click.milestone</code> and <code className="font-mono">link.expired</code> events.
        </p>

        <form onSubmit={createWebhook} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            required
            value={hookUrl}
            onChange={(e) => setHookUrl(e.target.value)}
            placeholder="https://hooks.example.com/shortly"
          />
          <Button type="submit">Add webhook</Button>
        </form>

        {newHookSecret && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-900/60 dark:bg-emerald-950/30">
            Signing secret (copy now): <code className="font-mono">{newHookSecret}</code>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {webhooks.length === 0 ? (
            <p className="text-xs text-zinc-500">No webhooks configured.</p>
          ) : (
            webhooks.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono">{w.url}</p>
                  <p className="text-zinc-500">
                    Events: {w.events.join(", ")} • {w.deliveriesCount} delivery log(s)
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteWebhook(w.id)} aria-label="Delete webhook">
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                </Button>
              </div>
            ))
          )}
        </div>
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

"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export interface LinkFormInitial {
  id?: string;
  originalUrl?: string;
  alias?: string;
  title?: string | null;
  redirectType?: number;
  expiresAt?: string | null;
  clickLimit?: number | null;
  hasPassword?: boolean;
  isActive?: boolean;
}

export function LinkForm({
  initial,
  mode,
  onSuccess,
  onCancel,
}: {
  initial?: LinkFormInitial;
  mode: "create" | "edit";
  onSuccess: (linkId: string) => void;
  onCancel?: () => void;
}) {
  const { toast } = useToast();
  const [originalUrl, setOriginalUrl] = React.useState(initial?.originalUrl ?? "");
  const [alias, setAlias] = React.useState(initial?.alias ?? "");
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [redirectType, setRedirectType] = React.useState<number>(
    initial?.redirectType ?? 302
  );
  const [expiresAtInput, setExpiresAtInput] = React.useState(() => {
    if (!initial?.expiresAt) return "";
    return new Date(initial.expiresAt).toISOString().slice(0, 16);
  });
  const [clickLimit, setClickLimit] = React.useState(
    initial?.clickLimit ? String(initial.clickLimit) : ""
  );
  const [password, setPassword] = React.useState("");
  const [clearPassword, setClearPassword] = React.useState(false);
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        originalUrl: originalUrl.trim(),
        redirectType,
        isActive,
        title: title.trim() ? title.trim() : null,
      };

      if (alias.trim() && (mode === "create" || alias.trim() !== initial?.alias)) {
        payload.alias = alias.trim();
      }

      if (expiresAtInput) {
        payload.expiresAt = new Date(expiresAtInput).toISOString();
      } else if (mode === "edit") {
        payload.expiresAt = null;
      }

      if (clickLimit.trim()) {
        payload.clickLimit = Number(clickLimit.trim());
      } else if (mode === "edit") {
        payload.clickLimit = null;
      }

      if (clearPassword) {
        payload.clearPassword = true;
      } else if (password) {
        payload.password = password;
      }

      const endpoint =
        mode === "create" ? "/api/urls" : `/api/urls/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(
          json?.error?.details?.[0]?.message ||
            json?.error?.message ||
            "Failed to save link"
        );
        return;
      }

      toast({
        kind: "success",
        title: mode === "create" ? "Short link created" : "Link updated",
      });
      const id = mode === "create" ? json.data.link.id : json.data.id;
      onSuccess(id);
    } catch {
      setError("Network error while saving link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="lf-url" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Destination URL *
        </label>
        <Input
          id="lf-url"
          type="url"
          required
          value={originalUrl}
          onChange={(e) => setOriginalUrl(e.target.value)}
          placeholder="https://example.com/landing"
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-alias" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Custom alias (optional)
          </label>
          <Input
            id="lf-alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="my-campaign"
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor="lf-title" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Label / Title (optional)
          </label>
          <Input
            id="lf-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Spring Launch"
            className="mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="lf-redirect" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Redirect status
          </label>
          <select
            id="lf-redirect"
            value={redirectType}
            onChange={(e) => setRedirectType(Number(e.target.value))}
            className="mt-1 flex h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <option value={302}>302 Found (Default)</option>
            <option value={307}>307 Temporary</option>
            <option value={301}>301 Permanent</option>
          </select>
        </div>

        <div>
          <label htmlFor="lf-limit" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Click limit
          </label>
          <Input
            id="lf-limit"
            type="number"
            min={1}
            value={clickLimit}
            onChange={(e) => setClickLimit(e.target.value)}
            placeholder="Unlimited"
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="lf-expires" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Expires at (UTC)
          </label>
          <Input
            id="lf-expires"
            type="datetime-local"
            value={expiresAtInput}
            onChange={(e) => setExpiresAtInput(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      {redirectType === 301 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          Warning: Browsers aggressively cache 301 redirects. Future destination edits, expiry rules, and analytics may be bypassed by returning visitors.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="lf-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {initial?.hasPassword ? "Replace password" : "Password protection (optional)"}
          </label>
          <Input
            id="lf-password"
            type="password"
            minLength={4}
            disabled={clearPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={initial?.hasPassword ? "Leave blank to keep current" : "Min 4 characters"}
            className="mt-1"
          />
          {initial?.hasPassword && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => setClearPassword(e.target.checked)}
              />
              Remove password protection
            </label>
          )}
        </div>

        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Link is active
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : mode === "create"
              ? "Create short link"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

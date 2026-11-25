"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function UnlockPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/urls/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: params.code, password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json?.error?.message || "Incorrect password");
        return;
      }
      window.location.href = json.data.redirectTo || `/${params.code}`;
    } catch {
      setError("Unable to verify password right now");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <Card className="w-full p-6 sm:p-8">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Protected link</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Enter the password to continue to{" "}
          <span className="font-mono font-medium">/{params.code}</span>.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <Input
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter link password"
            aria-label="Link password"
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Verifying..." : "Unlock & Continue"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push("/")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}

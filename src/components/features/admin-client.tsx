"use client";

import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface AdminPayload {
  stats: { usersCount: number; linksCount: number; clicksCount: number };
  reports: Array<{
    id: string;
    reportedCode: string;
    reason: string;
    status: string;
    shortUrl: { id: string; code: string; originalUrl: string; isActive: boolean } | null;
  }>;
  blockedDomains: Array<{ id: string; domain: string; reason: string | null }>;
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    isDisabled: boolean;
    _count: { shortUrls: number };
  }>;
}

export function AdminClient() {
  const { toast } = useToast();
  const [data, setData] = React.useState<AdminPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [domain, setDomain] = React.useState("");
  const [reason, setReason] = React.useState("");

  const reload = React.useCallback(async () => {
    const res = await fetch("/api/admin");
    const json = await res.json();
    if (res.ok && json.data) setData(json.data);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch("/api/admin")
      .then((r) => r.json())
      .then((json) => {
        if (active && json.data) setData(json.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function adminAction(payload: Record<string, unknown>, message: string) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast({ kind: "success", title: message });
      void reload();
    } else {
      toast({ kind: "error", title: "Admin action failed" });
    }
  }

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        <h1 className="text-2xl font-semibold tracking-tight">Admin Console</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Users</p>
          <p className="mt-1 text-2xl font-semibold">{data?.stats.usersCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Active &amp; Archived Links</p>
          <p className="mt-1 text-2xl font-semibold">{data?.stats.linksCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-zinc-500">Total Click Events</p>
          <p className="mt-1 text-2xl font-semibold">{data?.stats.clicksCount ?? 0}</p>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Blocked Domains</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void adminAction(
              { action: "block_domain", domain: domain.trim(), reason: reason.trim() },
              "Domain blocked"
            );
            setDomain("");
            setReason("");
          }}
          className="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <Input
            required
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="phishing-domain.example"
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <Button type="submit">Block domain</Button>
        </form>

        <div className="mt-4 space-y-2">
          {data?.blockedDomains.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
            >
              <span>
                <strong>{d.domain}</strong>
                {d.reason ? ` — ${d.reason}` : ""}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void adminAction(
                    { action: "unblock_domain", domain: d.domain },
                    "Domain unblocked"
                  )
                }
              >
                Unblock
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Abuse Reports</h2>
        {(data?.reports.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">No abuse reports submitted.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data?.reports.map((r) => (
              <div
                key={r.id}
                className="flex flex-col justify-between gap-2 rounded-lg border border-zinc-200 p-3 text-xs sm:flex-row sm:items-center dark:border-zinc-800"
              >
                <div>
                  <span className="font-mono font-semibold">/{r.reportedCode}</span>{" "}
                  <Badge>{r.status}</Badge>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">{r.reason}</p>
                </div>
                <div className="flex gap-2">
                  {r.shortUrl?.isActive && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        void adminAction(
                          { action: "disable_link", shortUrlId: r.shortUrl!.id },
                          "Link disabled"
                        )
                      }
                    >
                      Disable link
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void adminAction(
                        { action: "resolve_report", reportId: r.id, status: "ACTIONED" },
                        "Report resolved"
                      )
                    }
                  >
                    Mark actioned
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold">Users</h2>
        <div className="mt-3 space-y-2">
          {data?.users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
            >
              <span>
                {u.email} ({u.role}) — {u._count.shortUrls} links
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void adminAction(
                    { action: "toggle_user", userId: u.id, isDisabled: !u.isDisabled },
                    u.isDisabled ? "User enabled" : "User disabled"
                  )
                }
              >
                {u.isDisabled ? "Enable" : "Disable"}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

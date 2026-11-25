"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LinkForm } from "@/components/features/link-form";
import { QrStudio } from "@/components/features/qr-studio";
import { formatNumber, formatRelativeDate } from "@/lib/utils";

interface LinkDetail {
  id: string;
  originalUrl: string;
  code: string;
  shortUrl: string;
  title: string | null;
  redirectType: number;
  hasPassword: boolean;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface LinkAnalytics {
  range: string;
  hasData: boolean;
  summary: {
    totalClicks: number;
    humanClicks: number;
    botClicks: number;
    uniqueVisitors: number;
    qrClicks: number;
  };
  timeseries: Array<{ bucket: string; total: number; human: number; bot: number }>;
  topReferrers: Array<{ name: string; count: number }>;
  devices: Array<{ name: string; count: number }>;
  browsers: Array<{ name: string; count: number }>;
  oses: Array<{ name: string; count: number }>;
  countries: Array<{ name: string; count: number }>;
  utm: Array<{
    source: string | null;
    medium: string | null;
    campaign: string | null;
    count: number;
  }>;
  heatmap: Array<{ dayOfWeek: number; hour: number; count: number }>;
  recentClicks: Array<{
    id: string;
    clickedAt: string;
    referrerHost: string | null;
    country: string;
    deviceType: string;
    browser: string;
    os: string;
    isBot: boolean;
    source: string | null;
  }>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function LinkDetailClient({ linkId }: { linkId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [link, setLink] = React.useState<LinkDetail | null>(null);
  const [analytics, setAnalytics] = React.useState<LinkAnalytics | null>(null);
  const [range, setRange] = React.useState<"24h" | "7d" | "30d" | "all">("7d");
  const [loading, setLoading] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  const loadData = React.useCallback(async () => {
    try {
      const [linkRes, analyticsRes] = await Promise.all([
        fetch(`/api/urls/${linkId}`),
        fetch(`/api/urls/${linkId}/analytics?range=${range}`),
      ]);
      const linkJson = await linkRes.json();
      const analyticsJson = await analyticsRes.json();
      if (linkRes.ok && linkJson.data) setLink(linkJson.data);
      if (analyticsRes.ok && analyticsJson.data) setAnalytics(analyticsJson.data);
    } finally {
      setLoading(false);
    }
  }, [linkId, range]);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/urls/${linkId}`).then((r) => r.json()),
      fetch(`/api/urls/${linkId}/analytics?range=${range}`).then((r) => r.json()),
    ])
      .then(([linkJson, analyticsJson]) => {
        if (!active) return;
        if (linkJson?.data) setLink(linkJson.data);
        if (analyticsJson?.data) setAnalytics(analyticsJson.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [linkId, range]);

  async function copyUrl() {
    if (!link) return;
    await navigator.clipboard.writeText(link.shortUrl);
    setCopied(true);
    toast({ kind: "info", title: "Copied", description: link.shortUrl });
    setTimeout(() => setCopied(false), 1500);
  }

  async function deleteLink() {
    if (!link) return;
    const res = await fetch(`/api/urls/${link.id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ kind: "success", title: "Link deleted" });
      router.push("/dashboard");
    } else {
      toast({ kind: "error", title: "Failed to delete link" });
    }
  }

  if (loading && !link) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!link) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-lg font-semibold">Link not found</h1>
        <Link href="/dashboard">
          <Button className="mt-4">Back to dashboard</Button>
        </Link>
      </Card>
    );
  }

  const heatmapGrid = new Map<string, number>();
  let maxHeat = 1;
  for (const h of analytics?.heatmap ?? []) {
    heatmapGrid.set(`${h.dayOfWeek}-${h.hour}`, h.count);
    if (h.count > maxHeat) maxHeat = h.count;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      {/* Header */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-semibold text-indigo-600 dark:text-indigo-400">
                /{link.code}
              </h1>
              <Badge tone={link.isActive ? "emerald" : "neutral"}>
                {link.isActive ? "Active" : "Disabled"}
              </Badge>
              <Badge tone="indigo">{link.redirectType}</Badge>
            </div>
            <a
              href={link.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              <span className="truncate max-w-xl">{link.originalUrl}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyUrl}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy short URL"}
            </Button>
            <a href={`/${link.code}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm">Test redirect</Button>
            </a>
          </div>
        </div>
      </Card>

      {/* Range Selector + KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          {(["24h", "7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                range === r
                  ? "bg-indigo-600 text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "Total Clicks", val: analytics?.summary.totalClicks },
          { label: "Human Clicks", val: analytics?.summary.humanClicks },
          { label: "Unique Visitors", val: analytics?.summary.uniqueVisitors },
          { label: "Bot / Previews", val: analytics?.summary.botClicks },
          { label: "QR Scans", val: analytics?.summary.qrClicks },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {analytics ? formatNumber(kpi.val ?? 0) : "—"}
            </p>
          </Card>
        ))}
      </div>

      {/* Time Series */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Clicks over time</h3>
        <div className="mt-4 h-64 w-full min-w-0">
          {!analytics?.hasData ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
              No data recorded for this time range yet (distinguished from 0 clicks).
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analytics.timeseries}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(v: string) =>
                    range === "24h" ? v.slice(11, 16) : v.slice(5, 10)
                  }
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="human"
                  name="Human"
                  stroke="#4f46e5"
                  fill="#4f46e5"
                  fillOpacity={0.18}
                />
                <Area
                  type="monotone"
                  dataKey="bot"
                  name="Bot"
                  stroke="#a1a1aa"
                  fill="#a1a1aa"
                  fillOpacity={0.12}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[
          { title: "Top Referrers", items: analytics?.topReferrers ?? [] },
          { title: "Devices", items: analytics?.devices ?? [] },
          { title: "Browsers", items: analytics?.browsers ?? [] },
          { title: "Operating Systems", items: analytics?.oses ?? [] },
          { title: "Countries", items: analytics?.countries ?? [] },
        ].map((panel) => (
          <Card key={panel.title} className="p-5">
            <h3 className="text-sm font-semibold">{panel.title}</h3>
            {panel.items.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-500">No data yet.</p>
            ) : (
              <div className="mt-3 h-44 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={panel.items.slice(0, 6)} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        ))}

        {/* UTM Breakdown */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold">UTM Attribution</h3>
          {(analytics?.utm.length ?? 0) === 0 ? (
            <p className="mt-4 text-xs text-zinc-500">
              No UTM-tagged clicks recorded yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs">
              {analytics?.utm.map((u, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between rounded border border-zinc-100 px-2.5 py-1.5 dark:border-zinc-800"
                >
                  <span className="truncate">
                    {[u.source, u.medium, u.campaign].filter(Boolean).join(" / ")}
                  </span>
                  <span className="font-semibold">{formatNumber(u.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Peak Hours Heatmap */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Peak Hours Heatmap (UTC)</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Day of week vs hour of day click intensity
        </p>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[600px] space-y-1">
            {DAYS.map((dayName, dow) => (
              <div key={dayName} className="flex items-center gap-1">
                <span className="w-8 text-[11px] text-zinc-500">{dayName}</span>
                <div className="grid flex-1 grid-cols-24 gap-1">
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const count = heatmapGrid.get(`${dow}-${hour}`) ?? 0;
                    const ratio = count / maxHeat;
                    const bg =
                      count === 0
                        ? "bg-zinc-100 dark:bg-zinc-800/70"
                        : ratio > 0.66
                          ? "bg-indigo-600"
                          : ratio > 0.33
                            ? "bg-indigo-400"
                            : "bg-indigo-200 dark:bg-indigo-900";
                    return (
                      <div
                        key={hour}
                        title={`${dayName} ${String(hour).padStart(2, "0")}:00 UTC — ${count} click(s)`}
                        className={`h-4 rounded-xs ${bg}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* QR Studio & Edit Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <QrStudio linkId={link.id} code={link.code} shortUrl={link.shortUrl} />

        <Card className="p-5">
          <h2 className="text-base font-semibold">Edit Link Settings</h2>
          <div className="mt-4">
            <LinkForm
              mode="edit"
              initial={{
                id: link.id,
                originalUrl: link.originalUrl,
                alias: link.code,
                title: link.title,
                redirectType: link.redirectType,
                expiresAt: link.expiresAt,
                clickLimit: link.clickLimit,
                hasPassword: link.hasPassword,
                isActive: link.isActive,
              }}
              onSuccess={() => void loadData()}
            />
          </div>
        </Card>
      </div>

      {/* Recent Clicks */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold">Recent Activity Log</h3>
        {(analytics?.recentClicks.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">No clicks recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 pr-3">Browser / OS</th>
                  <th className="py-2 pr-3">Country</th>
                  <th className="py-2 pr-3">Referrer</th>
                  <th className="py-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {analytics?.recentClicks.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 text-zinc-500">
                      {formatRelativeDate(c.clickedAt)}
                    </td>
                    <td className="py-2 pr-3">{c.deviceType}</td>
                    <td className="py-2 pr-3">
                      {c.browser} / {c.os}
                    </td>
                    <td className="py-2 pr-3">{c.country}</td>
                    <td className="py-2 pr-3">{c.referrerHost ?? "Direct"}</td>
                    <td className="py-2">
                      {c.isBot ? (
                        <Badge tone="neutral">Bot</Badge>
                      ) : c.source === "qr" ? (
                        <Badge tone="indigo">QR</Badge>
                      ) : (
                        <Badge tone="emerald">Human</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Danger zone */}
      <Card className="flex flex-col items-start justify-between gap-3 border-rose-200 p-5 sm:flex-row sm:items-center dark:border-rose-900/60">
        <div>
          <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-400">
            Danger Zone
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Permanently delete /{link.code} and all associated analytics.
          </p>
        </div>
        <Button variant="danger" size="sm" onClick={deleteLink}>
          <Trash2 className="h-3.5 w-3.5" />
          Delete link
        </Button>
      </Card>
    </div>
  );
}

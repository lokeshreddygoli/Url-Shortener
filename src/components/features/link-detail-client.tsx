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
import { ArrowLeft, Check, Copy, Download, ExternalLink, Globe, Radio, Route, Sparkles, Trash2 } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LinkForm } from "@/components/features/link-form";
import { QrStudio } from "@/components/features/qr-studio";
import { formatNumber, formatRelativeDate } from "@/lib/utils";

interface LinkRuleItem {
  id: string;
  type: "DEVICE" | "COUNTRY" | "TIME_WINDOW" | "AB_SPLIT";
  targetUrl: string;
  device: string | null;
  country: string | null;
  weight: number | null;
  label: string | null;
}

interface LinkDetail {
  id: string;
  originalUrl: string;
  code: string;
  shortUrl: string;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  redirectType: number;
  hasPassword: boolean;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  rules?: LinkRuleItem[];
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
  variants: Array<{ variantId: string; count: number }>;
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

  // Live SSE feed state
  const [liveCount, setLiveCount] = React.useState<number | null>(null);
  const [liveEvents, setLiveEvents] = React.useState<
    Array<{ id: string; clickedAt: string; deviceType: string; browser: string; country: string }>
  >([]);

  // Smart routing rule form state
  const [ruleType, setRuleType] = React.useState<"DEVICE" | "COUNTRY" | "TIME_WINDOW" | "AB_SPLIT">("DEVICE");
  const [ruleTargetUrl, setRuleTargetUrl] = React.useState("");
  const [ruleDevice, setRuleDevice] = React.useState("mobile");
  const [ruleCountry, setRuleCountry] = React.useState("US");
  const [ruleStartTime, setRuleStartTime] = React.useState("09:00");
  const [ruleEndTime, setRuleEndTime] = React.useState("17:00");
  const [ruleWeight, setRuleWeight] = React.useState("50");

  // UTM builder state
  const [utmSource, setUtmSource] = React.useState("newsletter");
  const [utmMedium, setUtmMedium] = React.useState("email");
  const [utmCampaign, setUtmCampaign] = React.useState("launch");
  const [utmPresets, setUtmPresets] = React.useState<
    Array<{ id: string; name: string; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null }>
  >([]);
  const [presetName, setPresetName] = React.useState("");
  const [fetchingPreview, setFetchingPreview] = React.useState(false);

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
      fetch("/api/utm-presets").then((r) => r.json()).catch(() => null),
    ])
      .then(([linkJson, analyticsJson, presetsJson]) => {
        if (!active) return;
        if (linkJson?.data) setLink(linkJson.data);
        if (analyticsJson?.data) setAnalytics(analyticsJson.data);
        if (presetsJson?.data) setUtmPresets(presetsJson.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [linkId, range]);

  React.useEffect(() => {
    const es = new EventSource(`/api/urls/${linkId}/stream`);
    es.addEventListener("clicks", (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as {
          totalClicks: number;
          items: Array<{
            id: string;
            clickedAt: string;
            deviceType: string;
            browser: string;
            country: string;
          }>;
        };
        setLiveCount(parsed.totalClicks);
        setLiveEvents((prev) => [...parsed.items, ...prev].slice(0, 10));
      } catch {
        // Ignore parse error
      }
    });
    es.addEventListener("heartbeat", (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as { totalClicks: number };
        setLiveCount(parsed.totalClicks);
      } catch {
        // Ignore
      }
    });
    return () => es.close();
  }, [linkId]);

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

          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/urls/${link.id}/analytics/export?format=csv`} download>
              <Button variant="outline" size="sm">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </a>
            <Button
              variant="outline"
              size="sm"
              disabled={fetchingPreview}
              onClick={async () => {
                setFetchingPreview(true);
                try {
                  const res = await fetch(`/api/urls/${link.id}/preview`, { method: "POST" });
                  if (res.ok) {
                    toast({ kind: "success", title: "Link preview refreshed" });
                    void loadData();
                  } else {
                    toast({ kind: "error", title: "Could not fetch destination preview" });
                  }
                } finally {
                  setFetchingPreview(false);
                }
              }}
            >
              <Globe className="h-3.5 w-3.5" />
              {fetchingPreview ? "Fetching..." : "Fetch preview"}
            </Button>
            <Button variant="outline" size="sm" onClick={copyUrl}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy short URL"}
            </Button>
            <a href={`/${link.code}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm">Test redirect</Button>
            </a>
          </div>
        </div>
        {(link.title || link.description) && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950/60">
            {link.title && <p className="font-semibold">{link.title}</p>}
            {link.description && (
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{link.description}</p>
            )}
          </div>
        )}
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

      {/* Live SSE Click Stream + Smart Routing + UTM Builder */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-semibold">Live Click Stream (SSE)</h2>
            </div>
            <Badge tone="emerald">
              {liveCount !== null ? `${formatNumber(liveCount)} total` : "Listening"}
            </Badge>
          </div>
          {liveEvents.length === 0 ? (
            <p className="mt-4 text-xs text-zinc-500">
              Waiting for incoming clicks on /{link.code}...
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-xs">
              {liveEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between rounded border border-zinc-100 px-2.5 py-1.5 dark:border-zinc-800"
                >
                  <span>
                    {ev.deviceType} • {ev.browser} • {ev.country}
                  </span>
                  <span className="text-zinc-400">{formatRelativeDate(ev.clickedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-semibold">Smart Routing &amp; A/B Rules</h2>
          </div>
          <form
            className="mt-3 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const payload: Record<string, unknown> = {
                type: ruleType,
                targetUrl: ruleTargetUrl.trim(),
              };
              if (ruleType === "DEVICE") payload.device = ruleDevice;
              if (ruleType === "COUNTRY") payload.country = ruleCountry;
              if (ruleType === "TIME_WINDOW") {
                payload.startTime = ruleStartTime;
                payload.endTime = ruleEndTime;
              }
              if (ruleType === "AB_SPLIT") payload.weight = Number(ruleWeight);
              const res = await fetch(`/api/urls/${link.id}/rules`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              });
              if (res.ok) {
                setRuleTargetUrl("");
                toast({ kind: "success", title: "Routing rule added" });
                void loadData();
              } else {
                const j = await res.json();
                toast({ kind: "error", title: j?.error?.message || "Failed to add rule" });
              }
            }}
          >
            <select
              value={ruleType}
              onChange={(e) =>
                setRuleType(e.target.value as "DEVICE" | "COUNTRY" | "TIME_WINDOW" | "AB_SPLIT")
              }
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="DEVICE">Device Routing</option>
              <option value="COUNTRY">Country Routing</option>
              <option value="TIME_WINDOW">Time Window (UTC)</option>
              <option value="AB_SPLIT">A/B Split Variant</option>
            </select>
            {ruleType === "DEVICE" && (
              <select
                value={ruleDevice}
                onChange={(e) => setRuleDevice(e.target.value)}
                className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <option value="mobile">Mobile</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
              </select>
            )}
            {ruleType === "COUNTRY" && (
              <Input
                value={ruleCountry}
                onChange={(e) => setRuleCountry(e.target.value.toUpperCase())}
                placeholder="US"
                maxLength={2}
              />
            )}
            {ruleType === "TIME_WINDOW" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={ruleStartTime}
                  onChange={(e) => setRuleStartTime(e.target.value)}
                  placeholder="09:00"
                />
                <Input
                  value={ruleEndTime}
                  onChange={(e) => setRuleEndTime(e.target.value)}
                  placeholder="17:00"
                />
              </div>
            )}
            {ruleType === "AB_SPLIT" && (
              <Input
                type="number"
                min={1}
                max={100}
                value={ruleWeight}
                onChange={(e) => setRuleWeight(e.target.value)}
                placeholder="Weight (1-100)"
              />
            )}
            <Input
              type="url"
              required
              value={ruleTargetUrl}
              onChange={(e) => setRuleTargetUrl(e.target.value)}
              placeholder="https://example.com/variant"
            />
            <Button type="submit" size="sm" className="w-full">
              Add rule
            </Button>
          </form>

          <div className="mt-3 space-y-1.5 text-xs">
            {(link.rules ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded border border-zinc-200 px-2.5 py-1.5 dark:border-zinc-800"
              >
                <span className="truncate">
                  <Badge>{r.type}</Badge>{" "}
                  {r.device || r.country || (r.weight ? `${r.weight}%` : "")} → {r.targetUrl}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/urls/${link.id}/rules?ruleId=${r.id}`, {
                      method: "DELETE",
                    });
                    void loadData();
                  }}
                  className="text-rose-600 hover:underline cursor-pointer"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {(analytics?.variants.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <p className="text-xs font-medium text-zinc-500">Routing / A-B Variant Stats</p>
              <ul className="mt-2 space-y-1 text-xs">
                {analytics?.variants.map((v) => (
                  <li key={v.variantId} className="flex justify-between">
                    <span className="font-mono">{v.variantId}</span>
                    <span className="font-semibold">{formatNumber(v.count)} hits</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-sm font-semibold">UTM Link Builder &amp; Presets</h2>
          </div>
          <div className="mt-3 space-y-2">
            <Input
              value={utmSource}
              onChange={(e) => setUtmSource(e.target.value)}
              placeholder="utm_source"
            />
            <Input
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              placeholder="utm_medium"
            />
            <Input
              value={utmCampaign}
              onChange={(e) => setUtmCampaign(e.target.value)}
              placeholder="utm_campaign"
            />
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 font-mono text-[11px] break-all dark:border-zinc-800 dark:bg-zinc-950">
              {`${link.shortUrl}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign)}`}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const built = `${link.shortUrl}?utm_source=${encodeURIComponent(utmSource)}&utm_medium=${encodeURIComponent(utmMedium)}&utm_campaign=${encodeURIComponent(utmCampaign)}`;
                  void navigator.clipboard.writeText(built);
                  toast({ kind: "info", title: "UTM link copied" });
                }}
              >
                Copy UTM URL
              </Button>
            </div>
            <div className="flex gap-2 pt-1">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (!presetName.trim()) return;
                  const res = await fetch("/api/utm-presets", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      name: presetName.trim(),
                      utmSource,
                      utmMedium,
                      utmCampaign,
                    }),
                  });
                  if (res.ok) {
                    setPresetName("");
                    const j = await fetch("/api/utm-presets").then((r) => r.json());
                    if (j?.data) setUtmPresets(j.data);
                    toast({ kind: "success", title: "UTM preset saved" });
                  }
                }}
              >
                Save
              </Button>
            </div>
            {utmPresets.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {utmPresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setUtmSource(p.utmSource ?? "");
                      setUtmMedium(p.utmMedium ?? "");
                      setUtmCampaign(p.utmCampaign ?? "");
                    }}
                    className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800 cursor-pointer"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
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

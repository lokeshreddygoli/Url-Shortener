"use client";

import * as React from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Lock,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { LinkForm } from "@/components/features/link-form";
import { formatNumber, formatRelativeDate } from "@/lib/utils";

interface LinkItem {
  id: string;
  originalUrl: string;
  code: string;
  shortUrl: string;
  isCustom: boolean;
  redirectType: number;
  hasPassword: boolean;
  clickLimit: number | null;
  clickCount: number;
  expiresAt: string | null;
  isActive: boolean;
  hasQr: boolean;
  title: string | null;
  createdAt: string;
}

interface OverviewData {
  stats: {
    totalLinks: number;
    activeLinks: number;
    totalClicks: number;
    todayClicks: number;
  };
  hasData: boolean;
  trend: Array<{ date: string; clicks: number; humanClicks: number; botClicks: number }>;
  topLinks: Array<{
    id: string;
    code: string;
    originalUrl: string;
    clickCount: number;
  }>;
  recentActivity: Array<{
    id: string;
    shortUrlId: string;
    code: string;
    clickedAt: string;
    deviceType: string;
    browser: string;
    country: string;
    isBot: boolean;
  }>;
}

export function DashboardClient({ userName }: { userName: string }) {
  const { toast } = useToast();
  const [overview, setOverview] = React.useState<OverviewData | null>(null);
  const [overviewLoading, setOverviewLoading] = React.useState(true);

  const [links, setLinks] = React.useState<LinkItem[]>([]);
  const [linksLoading, setLinksLoading] = React.useState(true);
  const [linksError, setLinksError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("createdAt");
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [csvText, setCsvText] = React.useState("originalUrl,alias,title\nhttps://example.com/demo-1,,Example 1");
  const [importResult, setImportResult] = React.useState<{
    createdCount: number;
    failedCount: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);
  const [importing, setImporting] = React.useState(false);
  const [editingLink, setEditingLink] = React.useState<LinkItem | null>(null);
  const [deletingLink, setDeletingLink] = React.useState<LinkItem | null>(null);
  const [nowMs, setNowMs] = React.useState(0);

  const fetchOverview = React.useCallback(async () => {
    const res = await fetch("/api/analytics/overview");
    const json = await res.json();
    if (res.ok && json.data) {
      setOverview(json.data);
    }
    setOverviewLoading(false);
  }, []);

  const fetchLinks = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        sort: sortBy,
        order: "desc",
        page: String(page),
        pageSize: "10",
      });
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/urls?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setLinksError(json?.error?.message || "Failed to load links");
        return;
      }
      setLinksError(null);
      setLinks(json.data ?? []);
      setTotalPages(json.meta?.totalPages ?? 1);
      setSelectedIds(new Set());
      setNowMs(Date.now());
    } catch {
      setLinksError("Network error loading links");
    } finally {
      setLinksLoading(false);
    }
  }, [search, statusFilter, sortBy, page]);

  React.useEffect(() => {
    let active = true;
    fetch("/api/analytics/overview")
      .then((r) => r.json())
      .then((json) => {
        if (active && json.data) setOverview(json.data);
      })
      .finally(() => {
        if (active) setOverviewLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      void fetchLinks();
    }, 150);
    return () => clearTimeout(t);
  }, [fetchLinks]);

  function refreshAll() {
    setOverviewLoading(true);
    setLinksLoading(true);
    void fetchOverview();
    void fetchLinks();
  }

  async function copyShortUrl(item: LinkItem) {
    await navigator.clipboard.writeText(item.shortUrl);
    setCopiedId(item.id);
    toast({ kind: "info", title: "Copied", description: item.shortUrl });
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function toggleActive(item: LinkItem) {
    const nextState = !item.isActive;
    // Optimistic update
    setLinks((prev) =>
      prev.map((l) => (l.id === item.id ? { ...l, isActive: nextState } : l))
    );
    const res = await fetch(`/api/urls/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: nextState }),
    });
    if (!res.ok) {
      setLinks((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, isActive: item.isActive } : l))
      );
      toast({ kind: "error", title: "Failed to update status" });
      return;
    }
    toast({
      kind: "success",
      title: nextState ? "Link enabled" : "Link disabled",
    });
    void fetchOverview();
  }

  async function confirmDelete() {
    if (!deletingLink) return;
    const res = await fetch(`/api/urls/${deletingLink.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast({ kind: "error", title: "Failed to delete link" });
      return;
    }
    toast({ kind: "success", title: "Link deleted" });
    setDeletingLink(null);
    refreshAll();
  }

  async function runBulk(action: "enable" | "disable" | "delete") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const res = await fetch("/api/urls/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids, action }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Bulk action failed" });
      return;
    }
    toast({ kind: "success", title: `Applied '${action}' to ${ids.length} link(s)` });
    refreshAll();
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isExpired(item: LinkItem) {
    return Boolean(
      nowMs > 0 && item.expiresAt && new Date(item.expiresAt).getTime() <= nowMs
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Welcome back, {userName}. Monitor performance and manage your links.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/urls/export?format=csv" download="shortly-links.csv">
            <Button variant="outline" size="sm">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New link
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {overviewLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))
        ) : (
          <>
            <Card className="p-4">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total Links
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(overview?.stats.totalLinks ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Total Clicks
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(overview?.stats.totalClicks ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Today&apos;s Clicks
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(overview?.stats.todayClicks ?? 0)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Active Links
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {formatNumber(overview?.stats.activeLinks ?? 0)}
              </p>
            </Card>
          </>
        )}
      </div>

      {/* Chart + Top Links / Activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">14-Day Click Trend</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Human vs automated clicks across your workspace
              </p>
            </div>
          </div>
          <div className="mt-4 h-56 w-full min-w-0">
            {overviewLoading ? (
              <Skeleton className="h-full w-full" />
            ) : !overview?.hasData ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                No click data recorded yet — share a short link to see traffic.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.trend}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => v.slice(5)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="humanClicks"
                    name="Human clicks"
                    stroke="#4f46e5"
                    fill="#4f46e5"
                    fillOpacity={0.15}
                  />
                  <Area
                    type="monotone"
                    dataKey="botClicks"
                    name="Bot clicks"
                    stroke="#a1a1aa"
                    fill="#a1a1aa"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Top Links &amp; Recent Activity</h2>
          {overviewLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (overview?.topLinks.length ?? 0) === 0 ? (
            <p className="mt-6 text-xs text-zinc-500">
              No links created yet.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                {overview?.topLinks.slice(0, 3).map((l) => (
                  <Link
                    key={l.id}
                    href={`/dashboard/links/${l.id}`}
                    className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <span className="truncate font-mono font-medium text-indigo-600 dark:text-indigo-400">
                      /{l.code}
                    </span>
                    <span className="font-semibold">
                      {formatNumber(l.clickCount)} clicks
                    </span>
                  </Link>
                ))}
              </div>

              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <p className="text-xs font-medium text-zinc-500">Recent hits</p>
                {overview?.recentActivity.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-400">No clicks yet.</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">
                    {overview?.recentActivity.slice(0, 4).map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400"
                      >
                        <span className="truncate">
                          /{ev.code} • {ev.deviceType} • {ev.country}
                        </span>
                        <span className="shrink-0 text-[11px] text-zinc-400">
                          {formatRelativeDate(ev.clickedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Links Toolbar & Table */}
      <Card className="p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search alias, URL, or title..."
              aria-label="Search links"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter links by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="all">All links</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="disabled">Disabled</option>
              <option value="password">Password protected</option>
              <option value="has-qr">Has QR</option>
            </select>

            <select
              aria-label="Sort links"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
            >
              <option value="createdAt">Newest first</option>
              <option value="clickCount">Most clicks</option>
              <option value="expiresAt">Expiry date</option>
            </select>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs dark:border-indigo-900/60 dark:bg-indigo-950/30">
            <span className="font-medium">
              {selectedIds.size} link(s) selected
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => runBulk("enable")}>
                Enable
              </Button>
              <Button size="sm" variant="outline" onClick={() => runBulk("disable")}>
                Disable
              </Button>
              <Button size="sm" variant="danger" onClick={() => runBulk("delete")}>
                Delete
              </Button>
            </div>
          </div>
        )}

        {linksError ? (
          <div className="mt-6 rounded-xl border border-rose-200 p-6 text-center dark:border-rose-900/60">
            <p className="text-sm text-rose-600 dark:text-rose-400">{linksError}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={refreshAll}>
              Retry
            </Button>
          </div>
        ) : linksLoading ? (
          <div className="mt-5 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : links.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-200 p-10 text-center dark:border-zinc-800">
            <Link2 className="mx-auto h-8 w-8 text-zinc-400" />
            <h3 className="mt-3 text-sm font-semibold">No links found</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Create your first short link or adjust your search/filter criteria.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Create short link
            </Button>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800">
                    <th className="w-8 py-2.5 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Select all links"
                        checked={selectedIds.size === links.length && links.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(links.map((l) => l.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="py-2.5 pr-4 font-medium">Short Link</th>
                    <th className="py-2.5 pr-4 font-medium">Destination</th>
                    <th className="py-2.5 pr-4 font-medium">Status</th>
                    <th className="py-2.5 pr-4 font-medium">Clicks</th>
                    <th className="py-2.5 pr-4 font-medium">Created</th>
                    <th className="py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                  {links.map((item) => {
                    const expired = isExpired(item);
                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30">
                        <td className="py-3 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.code}`}
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                          />
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/dashboard/links/${item.id}`}
                              className="font-mono font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              /{item.code}
                            </Link>
                            {item.hasPassword && (
                              <Lock className="h-3 w-3 text-zinc-400" aria-label="Password protected" />
                            )}
                            {item.hasQr && (
                              <QrCode className="h-3 w-3 text-zinc-400" aria-label="QR generated" />
                            )}
                          </div>
                          {item.title && (
                            <p className="text-xs text-zinc-500">{item.title}</p>
                          )}
                        </td>
                        <td className="max-w-xs truncate py-3 pr-4 text-xs text-zinc-600 dark:text-zinc-400">
                          <a
                            href={item.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="truncate max-w-[240px]">{item.originalUrl}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </td>
                        <td className="py-3 pr-4">
                          {expired ? (
                            <Badge tone="amber">Expired</Badge>
                          ) : item.isActive ? (
                            <Badge tone="emerald">Active</Badge>
                          ) : (
                            <Badge tone="neutral">Disabled</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-medium">
                          {formatNumber(item.clickCount)}
                          {item.clickLimit ? (
                            <span className="text-xs text-zinc-400">
                              {" "}
                              / {formatNumber(item.clickLimit)}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-4 text-xs text-zinc-500">
                          {formatRelativeDate(item.createdAt)}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Copy ${item.shortUrl}`}
                              onClick={() => copyShortUrl(item)}
                            >
                              {copiedId === item.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Link href={`/dashboard/links/${item.id}`}>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Analytics for ${item.code}`}
                              >
                                <BarChart3 className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Edit ${item.code}`}
                              onClick={() => setEditingLink(item)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleActive(item)}
                            >
                              {item.isActive ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${item.code}`}
                              onClick={() => setDeletingLink(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {links.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/links/${item.id}`}
                        className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400"
                      >
                        /{item.code}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {item.originalUrl}
                      </p>
                    </div>
                    <Badge tone={item.isActive ? "emerald" : "neutral"}>
                      {isExpired(item) ? "Expired" : item.isActive ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>{formatNumber(item.clickCount)} clicks</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => copyShortUrl(item)}>
                        Copy
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingLink(item)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeletingLink(item)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-4 text-xs dark:border-zinc-800">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Modals */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportResult(null);
        }}
        title="Bulk import links (CSV)"
        description="Paste CSV rows with columns: originalUrl,alias,title"
      >
        <div className="space-y-3">
          <textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-950"
          />
          {importResult && (
            <div className="rounded-lg border border-zinc-200 p-3 text-xs dark:border-zinc-800">
              <p className="font-medium">
                Created: {importResult.createdCount} • Failed: {importResult.failedCount}
              </p>
              {importResult.errors.map((err) => (
                <p key={err.row} className="mt-1 text-rose-600 dark:text-rose-400">
                  Row {err.row}: {err.message}
                </p>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Close
            </Button>
            <Button
              disabled={importing}
              onClick={async () => {
                setImporting(true);
                try {
                  const res = await fetch("/api/urls/import", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ csv: csvText }),
                  });
                  const json = await res.json();
                  if (res.ok && json.data) {
                    setImportResult(json.data);
                    toast({
                      kind: "success",
                      title: `Imported ${json.data.createdCount} link(s)`,
                    });
                    refreshAll();
                  } else {
                    toast({ kind: "error", title: json?.error?.message || "Import failed" });
                  }
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? "Importing..." : "Run import"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create short link"
        description="Configure destination, alias, expiry, or access controls."
      >
        <LinkForm
          mode="create"
          onSuccess={() => {
            setCreateOpen(false);
            refreshAll();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={Boolean(editingLink)}
        onClose={() => setEditingLink(null)}
        title={`Edit /${editingLink?.code ?? ""}`}
      >
        {editingLink && (
          <LinkForm
            mode="edit"
            initial={{
              id: editingLink.id,
              originalUrl: editingLink.originalUrl,
              alias: editingLink.code,
              title: editingLink.title,
              redirectType: editingLink.redirectType,
              expiresAt: editingLink.expiresAt,
              clickLimit: editingLink.clickLimit,
              hasPassword: editingLink.hasPassword,
              isActive: editingLink.isActive,
            }}
            onSuccess={() => {
              setEditingLink(null);
              refreshAll();
            }}
            onCancel={() => setEditingLink(null)}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(deletingLink)}
        onClose={() => setDeletingLink(null)}
        title="Delete short link"
        description={`Are you sure you want to permanently delete /${deletingLink?.code ?? ""}? Its analytics history will also be removed.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeletingLink(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete permanently
          </Button>
        </div>
      </Modal>
    </div>
  );
}

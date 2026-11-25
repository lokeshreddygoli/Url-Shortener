import { Card } from "@/components/ui/card";

export const metadata = {
  title: "API Documentation",
};

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Shortly REST API</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Consistent JSON envelope across all endpoints. Full OpenAPI 3 specification coming in Phase 11 at{" "}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
          /api/openapi.json
        </code>
        .
      </p>

      <div className="mt-8 space-y-4">
        {[
          { method: "POST", path: "/api/urls", desc: "Create a short link (guest or authenticated)" },
          { method: "GET", path: "/api/urls", desc: "List, search, filter, and paginate owned links" },
          { method: "GET", path: "/api/urls/:id", desc: "Fetch single link details" },
          { method: "PATCH", path: "/api/urls/:id", desc: "Update destination, alias, expiry, or status" },
          { method: "DELETE", path: "/api/urls/:id", desc: "Delete link and release alias" },
          { method: "POST", path: "/api/urls/bulk", desc: "Bulk enable, disable, or delete links" },
          { method: "GET", path: "/api/urls/:id/analytics", desc: "Time-series, geo, device, referrer, UTM & heatmap metrics" },
          { method: "GET", path: "/api/urls/:id/qr", desc: "Generate customizable PNG or SVG QR code" },
          { method: "GET", path: "/api/analytics/overview", desc: "Dashboard overview KPIs and 14-day trend" },
          { method: "GET", path: "/api/health", desc: "Liveness probe" },
          { method: "GET", path: "/api/ready", desc: "PostgreSQL & Redis readiness probe" },
        ].map((ep) => (
          <Card key={`${ep.method}-${ep.path}`} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {ep.method}
              </span>
              <code className="font-mono text-sm">{ep.path}</code>
            </div>
            <span className="text-xs text-zinc-600 dark:text-zinc-400">{ep.desc}</span>
          </Card>
        ))}
      </div>
    </main>
  );
}

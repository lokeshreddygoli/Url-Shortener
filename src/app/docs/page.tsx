"use client";

import * as React from "react";
import { BookOpen, Bookmark, ExternalLink } from "lucide-react";
import { Badge, Card, Skeleton } from "@/components/ui/card";

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  paths: Record<
    string,
    Record<string, { summary?: string; security?: unknown[] }>
  >;
}

export default function DocsPage() {
  const [spec, setSpec] = React.useState<OpenApiSpec | null>(null);

  React.useEffect(() => {
    fetch("/api/openapi.json")
      .then((r) => r.json())
      .then((data) => setSpec(data))
      .catch(() => {});
  }, []);

  const bookmarkletHref =
    "javascript:(function(){var u=encodeURIComponent(location.href);window.open('http://localhost:3000/?url='+u,'_blank');})();";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h1 className="text-3xl font-semibold tracking-tight">
            {spec?.info.title || "Shortly REST API"}
          </h1>
          <Badge tone="indigo">OpenAPI {spec?.openapi || "3.0.3"}</Badge>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {spec?.info.description ||
            "Consistent JSON envelope across all endpoints."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <a
            href="/api/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View raw OpenAPI 3 JSON
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-zinc-400">•</span>
          <span className="text-zinc-500">
            Tip: Press <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">⌘K</kbd> / <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">Ctrl+K</kbd> anywhere for quick navigation.
          </span>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold">Browser Bookmarklet</h2>
        </div>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Drag this link to your bookmarks bar to shorten the current browser tab in one click:
        </p>
        <div className="mt-3">
          <a
            href={bookmarkletHref}
            className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-300"
          >
            Shorten with Shortly
          </a>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Endpoints</h2>
        {!spec ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          Object.entries(spec.paths).map(([path, methods]) =>
            Object.entries(methods).map(([method, op]) => (
              <Card
                key={`${method}-${path}`}
                className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold uppercase text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                    {method}
                  </span>
                  <code className="font-mono text-sm">{path}</code>
                  {op.security && <Badge tone="neutral">Auth</Badge>}
                </div>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {op.summary}
                </span>
              </Card>
            ))
          )
        )}
      </div>
    </main>
  );
}

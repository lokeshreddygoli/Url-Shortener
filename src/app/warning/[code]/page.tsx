"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function WarningPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function proceed() {
    setLoading(true);
    try {
      const res = await fetch("/api/urls/warning-proceed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: params.code }),
      });
      const json = await res.json();
      if (res.ok && json.data?.redirectTo) {
        window.location.href = json.data.redirectTo;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <Card className="w-full border-amber-200 p-6 sm:p-8 dark:border-amber-900/60">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Potentially unsafe destination</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Shortly&apos;s safety scanner flagged{" "}
          <span className="font-mono font-medium">/{params.code}</span> as potentially suspicious (e.g., lookalike domain or high-risk pattern). Only proceed if you trust the sender.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={() => router.push("/")}>
            Go back to safety
          </Button>
          <Button variant="outline" onClick={proceed} disabled={loading}>
            {loading ? "Proceeding..." : "Continue anyway"}
          </Button>
        </div>
      </Card>
    </main>
  );
}

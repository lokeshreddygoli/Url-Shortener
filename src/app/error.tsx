"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Application error boundary:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
        Something went wrong
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Unexpected application error
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Please try again. If the issue persists, check service health or contact support.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => router.push("/")}>
          Return home
        </Button>
      </div>
    </main>
  );
}

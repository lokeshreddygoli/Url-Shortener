import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-300">
        404 Not Found
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        The short link or page you requested does not exist or may have been deleted.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Back to home</Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="outline">Open dashboard</Button>
        </Link>
      </div>
    </main>
  );
}

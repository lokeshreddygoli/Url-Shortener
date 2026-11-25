import Link from "next/link";
import { Link2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white py-10 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Link2 className="h-4 w-4" />
          </span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            Shortly
          </span>
          <span>— Fast, privacy-first link infrastructure.</span>
        </div>

        <nav className="flex flex-wrap items-center gap-5 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/dashboard" prefetch={false} className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Dashboard
          </Link>
          <Link href="/docs" prefetch={false} className="hover:text-zinc-900 dark:hover:text-zinc-100">
            API Docs
          </Link>
          <Link href="/login" prefetch={false} className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Sign In
          </Link>
          <Link href="/register" prefetch={false} className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Create Account
          </Link>
        </nav>
      </div>
    </footer>
  );
}

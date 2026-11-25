"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Link2, LogOut, Menu, Settings, X } from "lucide-react";
import * as React from "react";
import { ThemeToggle } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const navLinks = session
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/new", label: "Create Link" },
        { href: "/settings", label: "Settings" },
        { href: "/docs", label: "API Docs" },
      ]
    : [
        { href: "/#features", label: "Features" },
        { href: "/#how-it-works", label: "How it works" },
        { href: "/docs", label: "API Docs" },
      ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            prefetch={false}
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
              <Link2 className="h-4 w-4" />
            </span>
            Shortly
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navLinks.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-50"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <div className="hidden items-center gap-2 md:flex">
            {status === "loading" ? (
              <div className="h-9 w-24 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
            ) : session ? (
              <>
                <Link href="/settings" prefetch={false}>
                  <Button variant="ghost" size="sm" aria-label="Account settings">
                    <Settings className="h-4 w-4" />
                    <span className="max-w-[140px] truncate">
                      {session.user.name || session.user.email}
                    </span>
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ callbackUrl: "/" })}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" prefetch={false}>
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register" prefetch={false}>
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 md:hidden dark:border-zinc-800 dark:text-zinc-300"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-zinc-200 bg-white px-4 py-4 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <nav className="flex flex-col gap-1">
            {navLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            {session ? (
              <Button
                variant="outline"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </Button>
            ) : (
              <>
                <Link href="/login" prefetch={false} onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full">
                    Sign in
                  </Button>
                </Link>
                <Link href="/register" prefetch={false} onClick={() => setMobileOpen(false)}>
                  <Button className="w-full">Get started</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

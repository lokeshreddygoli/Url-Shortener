"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  LayoutDashboard,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) return null;

  const actions = [
    {
      id: "dashboard",
      label: "Go to Dashboard",
      icon: LayoutDashboard,
      run: () => router.push("/dashboard"),
    },
    {
      id: "new-link",
      label: "Create New Short Link",
      icon: Plus,
      run: () => router.push("/dashboard/new"),
    },
    {
      id: "settings",
      label: "Open Account & API Settings",
      icon: Settings,
      run: () => router.push("/settings"),
    },
    {
      id: "docs",
      label: "Open API Documentation",
      icon: BookOpen,
      run: () => router.push("/docs"),
    },
    {
      id: "admin",
      label: "Open Admin Console",
      icon: ShieldAlert,
      run: () => router.push("/admin"),
    },
    {
      id: "theme",
      label: `Switch to ${resolvedTheme === "dark" ? "Light" : "Dark"} Theme`,
      icon: resolvedTheme === "dark" ? Sun : Moon,
      run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ].filter((a) => a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-24 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
          <Search className="h-4 w-4 text-zinc-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or destination..."
            className="w-full bg-transparent text-sm outline-none"
          />
          <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">
            ESC
          </kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {actions.length === 0 ? (
            <p className="p-4 text-center text-xs text-zinc-500">No commands match.</p>
          ) : (
            actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    action.run();
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <Icon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  {action.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

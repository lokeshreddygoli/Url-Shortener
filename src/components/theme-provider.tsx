"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";

type ThemeMode = "system" | "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (next: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

const listeners = new Set<() => void>();

function emitThemeChange() {
  for (const listener of listeners) listener();
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const val = localStorage.getItem("shortly-theme");
  if (val === "light" || val === "dark" || val === "system") return val;
  return "system";
}

function getResolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  if (mode === "light" || mode === "dark") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeClass(mode: ThemeMode): "light" | "dark" {
  const resolved = getResolvedTheme(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;
  }
  return resolved;
}

function subscribeTheme(callback: () => void) {
  listeners.add(callback);
  if (typeof window === "undefined") return () => listeners.delete(callback);

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMediaChange = () => {
    applyThemeClass(getStoredTheme());
    callback();
  };
  media.addEventListener("change", onMediaChange);
  return () => {
    listeners.delete(callback);
    media.removeEventListener("change", onMediaChange);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    subscribeTheme,
    getStoredTheme,
    (): ThemeMode => "system"
  );

  const resolvedTheme = React.useSyncExternalStore(
    subscribeTheme,
    () => getResolvedTheme(getStoredTheme()),
    (): "light" | "dark" => "light"
  );

  React.useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = React.useCallback((next: ThemeMode) => {
    localStorage.setItem("shortly-theme", next);
    applyThemeClass(next);
    emitThemeChange();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const currentTheme = mounted ? theme : "system";

  const cycle = () => {
    const order: ThemeMode[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(currentTheme) + 1) % order.length] ?? "system";
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Toggle theme (current: ${currentTheme})`}
      title={`Theme: ${currentTheme}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
    >
      {currentTheme === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : currentTheme === "light" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Monitor className="h-4 w-4" />
      )}
    </button>
  );
}

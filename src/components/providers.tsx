"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

const CommandPalette = dynamic(
  () =>
    import("@/components/features/command-palette").then(
      (m) => m.CommandPalette
    ),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [paletteEnabled, setPaletteEnabled] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteEnabled(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <ThemeProvider>
        <ToastProvider>
          {children}
          {paletteEnabled ? <CommandPalette defaultOpen /> : null}
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

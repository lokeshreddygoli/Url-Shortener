"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { CommandPalette } from "@/components/features/command-palette";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <ToastProvider>
          {children}
          <CommandPalette />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

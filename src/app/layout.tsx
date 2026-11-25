import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "optional",
});

export const metadata: Metadata = {
  title: {
    default: "Shortly — Fast, Privacy-First URL Shortener",
    template: "%s — Shortly",
  },
  description:
    "Shorten, brand, route, and analyze links with sub-50ms redirects, branded QR codes, and real-time privacy-first analytics.",
  openGraph: {
    title: "Shortly — Fast, Privacy-First URL Shortener",
    description:
      "Production-grade link management, analytics, smart routing, and branded QR codes.",
    type: "website",
  },
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('shortly-theme') || 'system';
    var d = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (d) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = d ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-[var(--background)] text-[var(--foreground)] antialiased">
        <Providers>
          <Navbar />
          <div className="flex-1">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

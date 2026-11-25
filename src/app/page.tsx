import Link from "next/link";
import {
  BarChart3,
  KeyRound,
  Lock,
  QrCode,
  Route,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { LandingShortener } from "@/components/features/landing-shortener";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Zap,
    title: "Sub-50ms Redirects",
    description:
      "Redis cache-aside lookups, non-blocking click ingestion, and explicit invalidation keep links instant without sacrificing accuracy.",
  },
  {
    icon: BarChart3,
    title: "Privacy-First Analytics",
    description:
      "Track referrers, devices, OS, geo, UTMs, and day-by-hour heatmaps using daily-rotating salted hashes instead of storing raw IPs.",
  },
  {
    icon: QrCode,
    title: "Branded QR Studio",
    description:
      "Customize colors and error correction, attribute QR scans separately in analytics, and export crisp PNG or SVG files.",
  },
  {
    icon: Lock,
    title: "Access & Expiry Controls",
    description:
      "Protect sensitive links with passwords, click limits, scheduled expiration dates, and instant enable/disable switches.",
  },
  {
    icon: Route,
    title: "Smart Routing & A/B Tests",
    description:
      "Route visitors by device, country, or time window, or split traffic across weighted A/B variants with per-variant metrics.",
  },
  {
    icon: ShieldCheck,
    title: "SSRF & Safety Guardrails",
    description:
      "Strict protocol checks, private/loopback IP blocking, destination re-validation on redirect, and safety interstitials.",
  },
];

const FAQS = [
  {
    q: "Do I need an account to shorten a URL?",
    a: "No. Guests can shorten URLs right away with a 30-day default expiry and claim those links automatically after creating an account.",
  },
  {
    q: "Why does Shortly use 302 redirects by default?",
    a: "302 responses with Cache-Control: no-store ensure every click hits our redirect engine so analytics, expiry, and routing rules stay accurate. You can opt into 307 or 301 per link.",
  },
  {
    q: "How is visitor privacy handled?",
    a: "Shortly never persists raw IP addresses. Unique visitor counts rely on a daily-rotating HMAC-SHA256 hash that cannot be correlated across days.",
  },
  {
    q: "Is there a REST API for automation?",
    a: "Yes. Generate scoped API keys in Settings and explore the interactive OpenAPI 3 documentation at /docs.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pt-16 pb-16 text-center sm:px-6 sm:pt-24 sm:pb-20">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/60 dark:text-indigo-300">
          <KeyRound className="h-3 w-3" />
          OpenAPI, QR Studio &amp; Real-Time Analytics
        </span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-6xl dark:text-zinc-50">
          Short links built for speed, clarity, and control.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          Create branded short links in milliseconds, monitor real-time traffic without storing PII, and share custom QR codes anywhere.
        </p>

        <LandingShortener />

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>302 no-store accuracy</span>
          <span>•</span>
          <span>Bot &amp; crawler separation</span>
          <span>•</span>
          <span>Zero raw IP storage</span>
        </div>
      </section>

      {/* Feature grid */}
      <section
        id="features"
        className="border-t border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950/50"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything required for production link infrastructure
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Engineered end-to-end with PostgreSQL, Redis cache-aside, strict input validation, and clean observability.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <Card key={feat.title} className="p-5">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{feat.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {feat.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-zinc-200 py-16 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Validate & Shorten",
                body: "Destinations are normalized, checked against SSRF and safety rules, and mapped to a cryptographic Base62 code or custom alias.",
              },
              {
                step: "02",
                title: "Resolve in Milliseconds",
                body: "Incoming clicks hit Redis cache-aside or indexed Postgres, evaluate expiry/passwords/routing rules, and enqueue analytics non-blocking.",
              },
              {
                step: "03",
                title: "Measure & Iterate",
                body: "Inspect live click feeds, UTM attribution, device/geo breakdowns, and QR scan performance directly in your dashboard.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900/60"
              >
                <span className="text-xs font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">
                  STEP {item.step}
                </span>
                <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-white py-16 dark:border-zinc-800 dark:bg-zinc-950/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FAQS.map((faq) => (
              <Card key={faq.q} className="p-5">
                <h3 className="text-sm font-semibold">{faq.q}</h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {faq.a}
                </p>
              </Card>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <h3 className="text-base font-semibold">Ready to manage links at scale?</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Create an account to claim guest links, build UTM presets, and unlock API access.
              </p>
            </div>
            <Link href="/register">
              <Button size="lg">Create free account</Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

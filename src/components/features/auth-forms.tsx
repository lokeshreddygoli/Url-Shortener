"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setError("Invalid email or password");
        return;
      }

      toast({ kind: "success", title: "Signed in" });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Failed to sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Sign in to manage your short links and analytics.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Email address
          </label>
          <Input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1.5"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      {googleEnabled && (
        <div className="mt-4">
          <div className="relative my-4 flex items-center justify-center text-xs text-zinc-400">
            <span className="bg-white px-2 dark:bg-zinc-900">or</span>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            Continue with Google
          </Button>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Create one
        </Link>
      </p>
    </Card>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let claimTokens: string[] = [];
      try {
        claimTokens = JSON.parse(
          localStorage.getItem("shortly_guest_claims") ?? "[]"
        );
      } catch {
        claimTokens = [];
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          claimTokens,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(
          json?.error?.details?.[0]?.message ||
            json?.error?.message ||
            "Registration failed"
        );
        return;
      }

      localStorage.removeItem("shortly_guest_claims");

      const signInRes = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (signInRes?.error) {
        router.push("/login");
        return;
      }

      toast({
        kind: "success",
        title: "Account created",
        description:
          json.data?.claimedLinks > 0
            ? `Claimed ${json.data.claimedLinks} guest link(s).`
            : undefined,
      });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error during registration");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Start managing custom short links, QR codes, and analytics.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="reg-name" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Full name
          </label>
          <Input
            id="reg-name"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Rivera"
            className="mt-1.5"
          />
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Email address
          </label>
          <Input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com"
            className="mt-1.5"
          />
        </div>

        <div>
          <label htmlFor="reg-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Password (min 8 characters)
          </label>
          <Input
            id="reg-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mt-1.5"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your email and we&apos;ll dispatch a reset link if an account exists.
      </p>

      {sent ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          If an account exists for <strong>{email}</strong>, password reset instructions have been sent (check server logs in development).
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Email address
            </label>
            <Input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mt-1.5"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-xs text-zinc-600 dark:text-zinc-400">
        <Link href="/login" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const [token, setToken] = React.useState(params.get("token") ?? "");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json?.error?.message || "Failed to reset password");
        return;
      }
      toast({ kind: "success", title: "Password updated" });
      router.push("/login");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="reset-token" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Reset token
          </label>
          <Input
            id="reset-token"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1.5"
          />
        </div>
        <div>
          <label htmlFor="reset-password" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
            New password (min 8 characters)
          </label>
          <Input
            id="reset-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5"
          />
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </Button>
      </form>
    </Card>
  );
}

export function VerifyEmailCard() {
  const params = useSearchParams();
  const initialToken = params.get("token") ?? "";
  const [token, setToken] = React.useState(initialToken);
  const [status, setStatus] = React.useState<"idle" | "verifying" | "verified" | "error">(
    initialToken ? "verifying" : "idle"
  );
  const [message, setMessage] = React.useState<string>("");

  const submitToken = React.useCallback(async (value: string) => {
    setStatus("verifying");
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: value.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setStatus("error");
        setMessage(json?.error?.message || "Verification failed");
        return;
      }
      setStatus("verified");
      setMessage(`Verified ${json.data?.email ?? "your email address"}.`);
    } catch {
      setStatus("error");
      setMessage("Network error while verifying email");
    }
  }, []);

  React.useEffect(() => {
    if (!initialToken) return;
    let active = true;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: initialToken.trim() }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!active) return;
        if (!res.ok || json.error) {
          setStatus("error");
          setMessage(json?.error?.message || "Verification failed");
          return;
        }
        setStatus("verified");
        setMessage(`Verified ${json.data?.email ?? "your email address"}.`);
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
        setMessage("Network error while verifying email");
      });
    return () => {
      active = false;
    };
  }, [initialToken]);

  return (
    <Card className="w-full p-6 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Confirm your Shortly account email address.
      </p>

      {status === "verified" ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            {message}
          </div>
          <Link href="/dashboard">
            <Button className="w-full">Go to dashboard</Button>
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitToken(token);
          }}
          className="mt-6 space-y-4"
        >
          <div>
            <label htmlFor="verify-token" className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Verification token
            </label>
            <Input
              id="verify-token"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1.5"
            />
          </div>
          {status === "error" && (
            <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
              {message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={status === "verifying"}>
            {status === "verifying" ? "Verifying..." : "Verify email"}
          </Button>
        </form>
      )}
    </Card>
  );
}

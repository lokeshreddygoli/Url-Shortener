"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { LinkForm } from "@/components/features/link-form";

export function NewLinkClient() {
  const router = useRouter();

  return (
    <div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
      <Card className="mt-4 p-6">
        <h1 className="text-xl font-semibold">Create a new short link</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Configure custom alias, expiration, click limit, or password protection.
        </p>
        <div className="mt-6">
          <LinkForm
            mode="create"
            onSuccess={(id) => router.push(`/dashboard/links/${id}`)}
            onCancel={() => router.push("/dashboard")}
          />
        </div>
      </Card>
    </div>
  );
}

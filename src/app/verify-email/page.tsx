import { Suspense } from "react";
import { VerifyEmailCard } from "@/components/features/auth-forms";

export const metadata = {
  title: "Verify Email",
};

export default function VerifyEmailPage() {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
        <VerifyEmailCard />
      </Suspense>
    </main>
  );
}

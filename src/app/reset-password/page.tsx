import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/features/auth-forms";

export const metadata = {
  title: "Reset Password",
};

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <Suspense fallback={<div className="text-sm text-zinc-500">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

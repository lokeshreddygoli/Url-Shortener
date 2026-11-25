import { ForgotPasswordForm } from "@/components/features/auth-forms";

export const metadata = {
  title: "Forgot Password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <ForgotPasswordForm />
    </main>
  );
}

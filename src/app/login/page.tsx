import { LoginForm } from "@/components/features/auth-forms";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <LoginForm googleEnabled={googleEnabled} />
    </main>
  );
}

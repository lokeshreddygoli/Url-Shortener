import { RegisterForm } from "@/components/features/auth-forms";

export const metadata = {
  title: "Create Account",
};

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-[75vh] max-w-md items-center px-4 py-12">
      <RegisterForm />
    </main>
  );
}

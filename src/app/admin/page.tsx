import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminClient } from "@/components/features/admin-client";

export const metadata = {
  title: "Admin Panel",
};

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AdminClient />
    </main>
  );
}

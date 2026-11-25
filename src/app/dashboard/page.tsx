import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardClient } from "@/components/features/dashboard-client";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <DashboardClient userName={session.user.name || session.user.email} />
    </main>
  );
}

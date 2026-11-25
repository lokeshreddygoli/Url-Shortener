import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsClient } from "@/components/features/settings-client";

export const metadata = {
  title: "Account Settings",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <SettingsClient />
    </main>
  );
}

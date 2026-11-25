import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { NewLinkClient } from "@/components/features/new-link-client";

export const metadata = {
  title: "Create Link",
};

export default async function NewLinkPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <NewLinkClient />
    </main>
  );
}

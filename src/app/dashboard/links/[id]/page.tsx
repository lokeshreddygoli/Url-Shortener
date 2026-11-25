import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LinkDetailClient } from "@/components/features/link-detail-client";

export const metadata = {
  title: "Link Analytics",
};

export default async function LinkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <LinkDetailClient linkId={id} />
    </main>
  );
}

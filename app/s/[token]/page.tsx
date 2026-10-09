import { redirect } from "next/navigation";

export default async function ShortSupplierRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/supplier-request/${encodeURIComponent(token)}`);
}

import { redirect } from "next/navigation";
export default async function LegacyDealChat({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  redirect(`/deals/${encodeURIComponent(dealId)}#chat`);
}

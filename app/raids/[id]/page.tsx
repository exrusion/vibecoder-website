import RaidBoard from "@/components/raid-board";

export default async function RaidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RaidBoard id={id} />;
}

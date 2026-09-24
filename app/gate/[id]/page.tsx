import GateUnlock from "@/components/gate-unlock";

export default async function GatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GateUnlock id={id} />;
}

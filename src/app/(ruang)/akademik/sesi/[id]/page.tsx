import { redirect } from "next/navigation";
import { requireActor } from "@/lib/server/session";

/** Tautan lama ke halaman sesi: kini sesi dibuka langsung di layar Presensi dengan sesi itu terpilih. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireActor({ roles: ["OWNER", "ADMIN", "PENGAJAR"] });
  const { id } = await params;
  redirect(`/akademik?sesi=${encodeURIComponent(decodeURIComponent(id))}`);
}

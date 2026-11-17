import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuLatihan } from "@/components/latihan-menu";
import { canSeeAllLatihan } from "@/lib/server/latihan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Coba latihan" };

/** Owner/admin mencoba keempat latihan seperti siswa. Hasilnya tidak disimpan. */
export default async function CobaLatihanPage() {
  const actor = await requireActor();
  if (!canSeeAllLatihan(actor)) notFound();
  return <MenuLatihan progres={null} coba />;
}

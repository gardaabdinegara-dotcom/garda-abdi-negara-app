import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { PageHead } from "@/components/ui";
import { localClock, sessionTypeLabel } from "@/lib/core/akademik";
import { loadSessionTypeCatalog } from "@/lib/server/akademik";
import { loadSettings } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";
import { BidangManager, type BidangRow } from "./bidang-client";

export const metadata: Metadata = { title: "Bidang presensi" };

const monthFmt = (sameYear: boolean) => new Intl.DateTimeFormat("id-ID", { month: "long", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });

export default async function SessionTypesPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const [catalog, settings] = await Promise.all([loadSessionTypeCatalog(), loadSettings()]);
  const year = localClock(settings.zona_waktu || "Asia/Jakarta", new Date().toISOString()).date.slice(0, 4);

  const rows: BidangRow[] = catalog.map((entry) => ({
    value: entry.value,
    label: entry.label,
    asli: sessionTypeLabel(entry.value),
    hidden: entry.hidden,
    dipakai: entry.dipakai,
    terakhir: entry.terakhir ? monthFmt(entry.terakhir.slice(0, 4) === year).format(new Date(`${entry.terakhir}T00:00:00Z`)) : "",
  }));

  return (
    <div className="page">
      <PageHead eyebrow="Pengaturan" title="Bidang presensi" description="Pilihan bidang yang tampil saat membuat atau mengubah sesi Presensi." />
      <SettingsTabs current="bidang-presensi" owner={actor.user.peran === "OWNER"} />
      <BidangManager rows={rows} addOperationId={randomUUID()} editOperationId={randomUUID()} />
    </div>
  );
}

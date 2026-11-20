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
      <div className="bp-layout">
        <BidangManager rows={rows} addOperationId={randomUUID()} editOperationId={randomUUID()} />
        <aside className="card bp-info" aria-labelledby="bp-info-h">
          <h2 id="bp-info-h">Cara kerja bidang</h2>
          <ul>
            <li>
              <b>Urutan</b>: panah naik/turun mengatur urutan pilihan Bidang saat membuat sesi. Taruh yang paling sering dipakai di atas.
            </li>
            <li>
              <b>Ganti nama</b> hanya mengubah nama tampilan. Sesi lama ikut memakai nama baru, rekapnya tetap utuh.
            </li>
            <li>
              <b>Sembunyikan</b> bidang yang tidak dipakai lagi. Bidang tidak dihapus agar riwayat presensi tetap terbaca.
            </li>
            <li>Bidang yang tampil di sini dipakai di Presensi, Beranda, dan rekap.</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { Notice, PageHead } from "@/components/ui";
import { canManageInstitution } from "@/lib/core/permissions";
import { WA_JENIS, WA_JENIS_LABEL, WA_TEMPLATE_DEFAULT, WA_TEMPLATE_FIELDS, WA_TEMPLATE_KEY, WA_TEMPLATE_MAX, waTemplates, type WaJenis } from "@/lib/core/wa";
import { loadSettings } from "@/lib/server/queries";
import { loadSettingRows } from "./data";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";
import { PesanWaEditor, type TemplateView } from "./pesan-wa-client";

export const metadata: Metadata = { title: "Pesan WA" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Contoh isian untuk pratinjau (nama fiktif). */
const CONTOH: Record<WaJenis, Record<string, string>> = {
  kehadiran: { nama: "RAKA PRATAMA", bulan: "November", persen: "48%", hadir: "12", sesi: "25", izin: "1", sakit: "3", alfa: "9" },
  latihan: { nama: "RAKA PRATAMA", catatan: "sudah 9 hari belum latihan" },
  samapta: {
    nama: "RAKA PRATAMA",
    tes: "Tes Samapta II",
    nilai: "58,20",
    klasifikasi: "Kurang",
    peringkat: "18",
    peserta: "24",
    garjas_a: "61,00",
    garjas_b: "55,40",
  },
};

export default async function PesanWaPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const params = await searchParams;
  const [settings, pengaturan] = await Promise.all([loadSettings(), loadSettingRows()]);
  const editable = canManageInstitution(actor);
  const current = waTemplates({ Pengaturan: pengaturan });
  const custom = new Set(WA_JENIS.filter((jenis) => pengaturan.some((row) => row.key === WA_TEMPLATE_KEY[jenis] && String(row.value ?? "").trim())));
  const jenis: WaJenis = (WA_JENIS as readonly string[]).includes(String(params.jenis)) ? (params.jenis as WaJenis) : "kehadiran";

  const templates: TemplateView[] = WA_JENIS.map((key) => ({
    jenis: key,
    label: WA_JENIS_LABEL[key],
    teks: current[key],
    bawaan: WA_TEMPLATE_DEFAULT[key],
    custom: custom.has(key),
    fields: WA_TEMPLATE_FIELDS[key],
    contoh: { ...CONTOH[key], lembaga: settings.nama_lembaga || "Garda Abdi Negara" },
  }));

  return (
    <div className="page">
      <PageHead eyebrow="Pengaturan" title="Pesan WA" description="Teks pesan WhatsApp yang terisi otomatis saat mengabari siswa atau wali." />
      <SettingsTabs current="pesan-wa" owner={actor.user.peran === "OWNER"} />
      {editable ? null : <Notice>Hanya owner yang dapat mengubah template pesan WA.</Notice>}
      <PesanWaEditor templates={templates} initial={jenis} editable={editable} max={WA_TEMPLATE_MAX} operationId={randomUUID()} resetOperationId={randomUUID()} />
    </div>
  );
}

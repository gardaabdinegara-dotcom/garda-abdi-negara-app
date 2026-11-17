import type { Metadata } from "next";
import { BlangkoSheet, namaHari, tanggalPanjang } from "@/components/blangko";
import { canManageSamapta } from "@/lib/core/samapta";
import { linkedStudentIds } from "@/lib/core/types";
import { loadBlangko } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import { CetakBar } from "../../cetak-bar";

export const metadata: Metadata = { title: "Cetak blangko samapta" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Blangko terisi: satu siswa (?siswa=SIS_...) atau semua peserta satu tes (?siswa=semua). */
export default async function BlangkoTesPage({ params, searchParams }: { params: Promise<{ tesId: string }>; searchParams: Search }) {
  const actor = await requireActor();
  const { tesId } = await params;
  const raw = (await searchParams).siswa;
  const staff = canManageSamapta(actor);
  const pilihan = (Array.isArray(raw) ? raw[0] : raw)?.trim() || (staff ? "semua" : (linkedStudentIds(actor, "SISWA")[0] ?? ""));
  const { settings, test, entries } = await loadBlangko(actor, tesId, pilihan);

  const satu = entries.length === 1 && pilihan !== "semua" ? entries[0]!.student : null;
  const tanggal = `${namaHari(test.tanggal)}, ${tanggalPanjang(test.tanggal)}`;
  const sub = [
    satu ? `1 lembar · ${satu.nama} (${satu.kode_siswa})` : `${entries.length} lembar, satu per siswa`,
    tanggal,
    test.status === "BERJALAN" ? "Tes masih berjalan, isian yang belum ada dicetak kosong." : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="cetak">
      <CetakBar back={staff ? { href: `/samapta/${encodeURIComponent(test.tes_id)}?tab=hasil`, label: "Hasil tes" } : { href: "/samapta", label: "Tes samapta" }} title={`Blangko ${test.nama}`} sub={sub} />
      <div className="cetak-sheets">
        {entries.map((e) => (
          <div className="blangko-frame" key={e.student.siswa_id}>
            <BlangkoSheet settings={settings} isi={{ test, student: e.student, result: e.result, score: e.score, usia: e.usia }} />
          </div>
        ))}
      </div>
    </main>
  );
}

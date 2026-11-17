import type { Metadata } from "next";
import { BlangkoSheet } from "@/components/blangko";
import { loadBlankSettings } from "@/lib/server/samapta";
import { requireActor } from "@/lib/server/session";
import { CetakBar } from "../../cetak-bar";

export const metadata: Metadata = { title: "Cetak blangko kosong" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const MAKS = 40;

/** Blangko kosong untuk diisi tangan di lapangan. Khusus owner/staf. */
export default async function BlangkoKosongPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const settings = await loadBlankSettings(actor);
  const raw = (await searchParams).jumlah;
  const parsed = Number.parseInt(String((Array.isArray(raw) ? raw[0] : raw) ?? ""), 10);
  const jumlah = Number.isFinite(parsed) ? Math.min(MAKS, Math.max(1, parsed)) : 1;

  return (
    <main className="cetak">
      <CetakBar back={{ href: "/samapta", label: "Tes samapta" }} title="Blangko kosong" sub={`${jumlah} lembar untuk diisi tangan`}>
        <form method="get" className="cetak-jumlah">
          <label htmlFor="jumlah">Jumlah lembar</label>
          <input id="jumlah" name="jumlah" type="number" inputMode="numeric" min={1} max={MAKS} defaultValue={jumlah} required />
          <button type="submit" className="btn btn-secondary btn-sm">
            Ubah
          </button>
        </form>
      </CetakBar>
      <div className="cetak-sheets">
        {Array.from({ length: jumlah }, (_, i) => (
          <div className="blangko-frame" key={i}>
            <BlangkoSheet settings={settings} />
          </div>
        ))}
      </div>
    </main>
  );
}

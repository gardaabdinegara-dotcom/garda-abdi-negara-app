import type { Metadata } from "next";
import { KeuanganHead, LainnyaDaftar } from "@/components/keuangan";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Keuangan · Lainnya" };

/** Pengaturan dan laporan yang jarang dipakai, dipisah dari pencatatan harian. */
export default async function FinanceMorePage() {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  return (
    <div className="page kg-page">
      <KeuanganHead current="lainnya" />
      <section className="card kg-lainnya" aria-label="Menu lainnya">
        <LainnyaDaftar data={data} />
      </section>
      <p className="kg-note">Bagian ini jarang dipakai. Catatan harian cukup lewat tab Transaksi.</p>
    </div>
  );
}

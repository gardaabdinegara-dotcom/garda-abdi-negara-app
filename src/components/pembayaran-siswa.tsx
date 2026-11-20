// Kartu "Pembayaran" di profil siswa: uang masuk yang dicatat dari siswa ini (bukan tagihan).
// Hanya owner/admin dengan akses lihat keuangan; selain itu tidak tampil sama sekali.
import Link from "next/link";
import { loadPembayaranSiswa } from "@/lib/server/keuangan";
import { getActor } from "@/lib/server/session";
import "./pembayaran-siswa.css";

const rp = (n: number) => `Rp${Math.abs(n).toLocaleString("id-ID")}`;
const TANGGAL = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const tanggal = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? TANGGAL.format(new Date(`${d}T00:00:00Z`)).replace(".", "") : d || "-");

function IkonMasuk() {
  return (
    <svg className="ps-ic-svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

export async function PembayaranSiswaCard({ siswaId }: { siswaId: string }) {
  const actor = await getActor();
  if (!actor) return null;
  const data = await loadPembayaranSiswa(actor, siswaId);
  if (!data) return null;
  return (
    <section className="card ps-card" aria-labelledby="ps-judul">
      <div className="ps-head">
        <h2 id="ps-judul">Pembayaran</h2>
        <p>Uang masuk yang ditautkan ke siswa ini.</p>
      </div>
      {data.jumlah ? (
        <>
          <div className="ps-tot">
            <span>Total tercatat</span>
            <b>{rp(data.total)}</b>
            <span>
              {data.jumlah} kali bayar · terakhir {tanggal(data.terakhir ?? "")}
            </span>
          </div>
          <ul className="ps-list">
            {data.items.map((i) => (
              <li key={i.id}>
                <span className="ps-ic">
                  <IkonMasuk />
                </span>
                <span className="ps-main">
                  <b>{i.judul}</b>
                  <span>
                    {tanggal(i.tanggal)} · {i.akun}
                  </span>
                </span>
                <span className="ps-plus">+{rp(i.nominal)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="ps-empty">
          Belum ada uang masuk yang ditautkan. Saat mencatat <Link href="/keuangan">Uang masuk</Link>, pilih siswa ini di bagian Dari siswa.
        </p>
      )}
      <p className="ps-note">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01" />
        </svg>
        <span>
          Catatan uang masuk dari siswa ini, <b>bukan tagihan</b>. Sisa bayar tidak dihitung otomatis.
        </span>
      </p>
    </section>
  );
}

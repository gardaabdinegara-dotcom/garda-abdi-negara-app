import type { Metadata } from "next";
import Link from "next/link";
import { aturUlangPratinjau, matikanPratinjau, nyalakanPratinjau } from "@/app/actions/pratinjau";
import { mulaiUjiSiswa } from "@/app/actions/uji-siswa";
import { Notice, PageHead } from "@/components/ui";
import { isPreview } from "@/lib/server/data";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Mode pratinjau" };

export default async function PreviewPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const on = await isPreview();
  return (
    <div className="page">
      <PageHead
        eyebrow="Pengaturan"
        title="Mode pratinjau"
        description="Lihat semua fitur berjalan dengan data contoh, tanpa menyentuh data asli di spreadsheet."
      />
      <SettingsTabs current="pratinjau" owner={actor.user.peran === "OWNER"} />
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Mode Uji Siswa</h2>
            <p>Buka menu siswa dengan akun fiktif untuk mencoba presensi, latihan, hasil Samapta, dan ganti PIN.</p>
          </div>
        </div>
        <p className="muted">Aktivitas uji tersimpan sementara di browser ini hingga 4 jam atau sampai Anda kembali ke akun staf.</p>
        <form action={mulaiUjiSiswa}>
          <button type="submit" className="btn">Coba sebagai siswa</button>
        </form>
      </section>
      {on ? <Notice tone="warning">Mode pratinjau sedang aktif. Semua yang tampil dan semua perubahan memakai data contoh.</Notice> : null}
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{on ? "Sedang memakai data contoh" : "Coba dengan data contoh"}</h2>
              <p>24 siswa fiktif, presensi dua minggu terakhir (termasuk sesi yang sedang berlangsung), Tes Samapta I dan II, latihan psikotes tiga minggu, serta pemasukan dan pengeluaran dua bulan.</p>
            </div>
          </div>
          <ul className="guide-steps">
            <li>Hanya terlihat oleh Anda di browser ini. Siswa dan perangkat lain tetap melihat data asli.</li>
            <li>Semua fitur bisa dicoba: buka sesi dan sahkan presensi, isi tes per pos, cetak atau unduh blangko, catat transaksi, buka laporan keuangan.</li>
            <li>Perubahan di pratinjau tidak pernah masuk ke spreadsheet dan bisa hilang saat server dimulai ulang.</li>
            <li>Mode ini mati otomatis setelah 4 jam.</li>
          </ul>
          <div className="row">
            {on ? (
              <>
                <form action={matikanPratinjau}>
                  <button type="submit" className="btn">
                    Kembali ke data asli
                  </button>
                </form>
                <form action={aturUlangPratinjau}>
                  <button type="submit" className="btn btn-secondary">
                    Atur ulang data contoh
                  </button>
                </form>
                <Link href="/beranda" className="btn btn-ghost">
                  Lanjut melihat
                </Link>
              </>
            ) : (
              <form action={nyalakanPratinjau}>
                <button type="submit" className="btn">
                  Masuk mode pratinjau
                </button>
              </form>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Yang bisa dicoba</h2>
          </div>
          <ul className="guide-steps">
            <li>
              <b>Presensi</b>: sesi sore ini sedang berlangsung dengan 3 pengajuan menunggu disahkan.
            </li>
            <li>
              <b>Tes Samapta</b>: Tes II masih berjalan (beberapa pos belum lengkap); Tes I sudah selesai dan bisa dicetak semua blangkonya.
            </li>
            <li>
              <b>Latihan siswa</b>: rekap tiga minggu latihan psikotes, termasuk siswa yang belum pernah latihan, lama tidak latihan, atau skornya turun. Ketuk nama untuk melihat progresnya.
            </li>
            <li>
              <b>Keuangan</b>: pemasukan bimbel dan pengeluaran dua bulan; laporan laba rugi dan neraca siap diunduh.
            </li>
            <li>
              <b>Siswa</b>: profil lengkap dengan tempat lahir, asal sekolah, dan status PIN.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

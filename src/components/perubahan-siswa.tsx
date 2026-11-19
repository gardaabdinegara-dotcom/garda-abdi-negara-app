import type { ReactNode } from "react";
import type { PerbandinganSiswa, RentangTanggal } from "@/lib/core/perubahan-siswa";
import "./perubahan-siswa.css";

const tanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const angka = new Intl.NumberFormat("id-ID");
const selisih = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

function labelRentang(rentang: RentangTanggal): string {
  return tanggal.formatRange(new Date(`${rentang.dari}T00:00:00Z`), new Date(`${rentang.sampai}T00:00:00Z`));
}

export function PerubahanSiswaCard({
  periode,
  perbandingan,
  satuan,
  keterangan,
  petunjuk,
}: {
  periode: RentangTanggal;
  perbandingan: PerbandinganSiswa | null;
  satuan: "poin" | "poin persentase";
  keterangan: string;
  petunjuk: ReactNode;
}) {
  const median = perbandingan?.median ?? null;
  return (
    <section className="card perubahan-siswa" aria-labelledby="judul-perubahan-siswa">
      <header>
        <h2 id="judul-perubahan-siswa">Perubahan siswa yang sama</h2>
        <p>{perbandingan ? keterangan : petunjuk}</p>
      </header>
      {perbandingan ? (
        <div className="perubahan-siswa-isi">
          <dl className="perubahan-siswa-periode">
            <div><dt>Periode sebelumnya</dt><dd>{labelRentang(perbandingan.sebelumnya)}</dd></div>
            <div><dt>Periode terpilih</dt><dd>{labelRentang(periode)}</dd></div>
          </dl>
          {median === null ? (
            <p className="perubahan-siswa-kosong">Belum ada siswa dengan data di kedua periode.</p>
          ) : (
            <div className="perubahan-siswa-ringkas">
              <div className="perubahan-siswa-median" data-arah={median > 0 ? "naik" : median < 0 ? "turun" : "tetap"}>
                <span>Median perubahan</span>
                <b>{selisih.format(median)} <small>{satuan}</small></b>
                <span>{angka.format(perbandingan.siswa)} siswa dibandingkan</span>
              </div>
              <dl className="perubahan-siswa-arah" aria-label="Jumlah siswa menurut arah perubahan">
                <div><dt>Naik</dt><dd>{angka.format(perbandingan.naik)}</dd></div>
                <div><dt>Tetap</dt><dd>{angka.format(perbandingan.tetap)}</dd></div>
                <div><dt>Turun</dt><dd>{angka.format(perbandingan.turun)}</dd></div>
              </dl>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

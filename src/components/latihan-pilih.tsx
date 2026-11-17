"use client";

// Pilihan durasi dan empat kartu jenis latihan di menu Latihan. Kartu langsung membuka layar latihan
// dengan durasi terpilih. Durasi terakhir diingat di HP ini (hanya kenyamanan; boleh hilang).
import Link from "next/link";
import { useEffect, useState } from "react";
import { DURASI_LABEL, DURASI_LATIHAN, isDurasi, JENIS_INFO, type DurasiLatihan, type JenisLatihan } from "@/lib/core/latihan";
import { keteranganDurasi } from "@/lib/core/latihan-soal";
import { Icon } from "./icon";
import { IKON_LATIHAN } from "./latihan-hasil";

export interface KartuLatihan {
  jenis: JenisLatihan;
  /** Skor latihan terakhir, null bila belum pernah. */
  skor: number | null;
  jumlah: number;
  /** Selisih skor terakhir dengan latihan sebelumnya. */
  tren: number | null;
}

const KUNCI_DURASI = "rg-latihan-durasi";
const KET_DURASI: Record<DurasiLatihan, string> = {
  singkat: "Pemanasan cepat, cocok untuk latihan harian.",
  standar: "Latihan rutin dengan waktu per kolom seperti tes.",
  asli: "Jumlah kolom dan waktu seperti tes sebenarnya.",
};

export function PilihLatihan({ kartu, coba }: { kartu: KartuLatihan[]; coba: boolean }) {
  const [durasi, setDurasi] = useState<DurasiLatihan>("standar");

  useEffect(() => {
    try {
      const simpan = window.localStorage.getItem(KUNCI_DURASI);
      if (isDurasi(simpan)) setDurasi(simpan);
    } catch {
      // penyimpanan HP tidak tersedia: tetap memakai Standar
    }
  }, []);

  const pilih = (d: DurasiLatihan) => {
    setDurasi(d);
    try {
      window.localStorage.setItem(KUNCI_DURASI, d);
    } catch {
      // abaikan
    }
  };

  return (
    <>
      <section className="card lt-card lt-durasi" aria-labelledby="lt-durasi-h">
        <div>
          <h2 id="lt-durasi-h">Durasi</h2>
          <p className="lt-sub">{KET_DURASI[durasi]}</p>
        </div>
        <div className="lt-seg" role="group" aria-labelledby="lt-durasi-h">
          {DURASI_LATIHAN.map((d) => (
            <button key={d} type="button" aria-pressed={durasi === d} onClick={() => pilih(d)}>
              {DURASI_LABEL[d]}
            </button>
          ))}
        </div>
      </section>
      <div className="lt-tiles">
        {kartu.map((k) => {
          const info = JENIS_INFO[k.jenis];
          const meta = coba ? "Coba tanpa menyimpan" : k.skor === null ? "Belum pernah latihan" : `Skor terakhir ${k.skor} · ${k.jumlah} latihan`;
          return (
            <Link key={k.jenis} className="lt-tile" href={`/kerjakan/${k.jenis}?durasi=${durasi}`}>
              <span className={`lt-ico lt-ico-${k.jenis}`} aria-hidden="true">
                {IKON_LATIHAN[k.jenis]}
              </span>
              <span className="lt-tile-main">
                <b>{info.nama}</b>
                <span>{meta}</span>
                <span className="lt-tile-dur">{keteranganDurasi(k.jenis, durasi)}</span>
              </span>
              {k.tren !== null && !coba ? (
                <span className={`badge ${k.tren > 0 ? "badge-success" : k.tren < 0 ? "badge-danger" : ""}`} aria-label={k.tren === 0 ? "Skor sama dengan latihan sebelumnya" : `Skor ${k.tren > 0 ? "naik" : "turun"} ${Math.abs(k.tren)} poin`}>
                  {k.tren > 0 ? "▲" : k.tren < 0 ? "▼" : "="} {Math.abs(k.tren)}
                </span>
              ) : (
                <span className="lt-tile-go" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}

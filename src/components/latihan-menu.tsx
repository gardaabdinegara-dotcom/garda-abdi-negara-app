// Menu empat jenis latihan (siswa) dan mode coba (owner/admin, tidak disimpan).
// Kartu menampilkan skor terakhir dan tren; pilihan durasi dan kartu ada di komponen klien PilihLatihan.
import Link from "next/link";
import { JENIS_INFO, JENIS_LATIHAN } from "@/lib/core/latihan";
import type { ProgresLatihan } from "@/lib/server/latihan";
import { Icon } from "./icon";
import { PilihLatihan, type KartuLatihan } from "./latihan-pilih";
import { KirimTertunda } from "./latihan-tertunda";
import { PageHead } from "./ui";

const namaDepan = (nama: string) => nama.trim().split(/\s+/)[0] ?? nama;

function ringkasan(progres: ProgresLatihan): string {
  const terbaru = progres.riwayat[0];
  if (!terbaru) return "Belum ada latihan. Mulai dari durasi Singkat untuk pemanasan.";
  const minggu = progres.mingguIni ? `Minggu ini ${progres.mingguIni} latihan.` : "Belum ada latihan minggu ini.";
  const j = progres.perJenis[terbaru.jenis];
  const nama = JENIS_INFO[terbaru.jenis].nama;
  if (j.tren === null) return `${minggu} Skor ${nama} terakhir ${terbaru.skor}.`;
  if (j.tren === 0) return `${minggu} Skor ${nama} sama dengan latihan sebelumnya (${terbaru.skor}).`;
  return `${minggu} Skor ${nama} ${j.tren > 0 ? "naik" : "turun"} ${Math.abs(j.tren)} poin dari latihan sebelumnya.`;
}

export function MenuLatihan({ progres, coba }: { progres: ProgresLatihan | null; coba: boolean }) {
  const kartu: KartuLatihan[] = JENIS_LATIHAN.map((jenis) => {
    const j = progres?.perJenis[jenis];
    return { jenis, skor: j?.terakhir?.skor ?? null, jumlah: j?.jumlah ?? 0, tren: j?.tren ?? null };
  });

  if (coba) {
    return (
      <div className="page lt-page">
        <PageHead back={{ href: "/latihan", label: "Latihan siswa" }} title="Coba latihan" description="Rasakan latihan seperti yang dikerjakan siswa di HP." />
        <p className="notice notice-warning lt-coba">Mode coba: latihan berjalan seperti biasa, tetapi hasilnya tidak disimpan dan tidak masuk rekap.</p>
        <div className="lt-menu">
          <div className="lt-menu-main">
            <PilihLatihan kartu={kartu} coba />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page lt-page">
      <PageHead title="Latihan Psikotes" description="Pilih durasi, lalu ketuk jenis latihan. Angka dan simbol dibuat acak setiap kali, jadi tiap latihan berbeda." />
      {progres ? <KirimTertunda pemilik={progres.student.siswa_id} /> : null}
      <div className="lt-menu">
        <div className="lt-menu-main">
          {progres ? (
            <section className="card lt-card lt-sapa">
              <h2>Halo, {namaDepan(progres.student.nama)}</h2>
              <p>{ringkasan(progres)}</p>
            </section>
          ) : (
            <p className="notice notice-warning">Akun ini belum ditautkan ke data siswa, jadi hasil latihan belum bisa disimpan. Hubungi admin.</p>
          )}
          <PilihLatihan kartu={kartu} coba={false} />
        </div>
        <aside className="lt-menu-side">
          <Link className="lt-tile lt-tile-progres" href="/latihan/progres">
            <span className="lt-ico lt-ico-progres" aria-hidden="true">
              <Icon name="chart" />
            </span>
            <span className="lt-tile-main">
              <b>Progres saya</b>
              <span>{progres?.riwayat.length ? `${progres.riwayat.length} latihan tercatat` : "Grafik skor dan bar progres semua latihan"}</span>
            </span>
            <span className="badge badge-info">Lihat</span>
          </Link>
          <section className="card lt-card lt-tips">
            <h2>Tips</h2>
            <ul>
              <li>Kerjakan di tempat tenang dan jangan keluar dari layar; waktu tetap berjalan.</li>
              <li>Mulai dari Singkat, lalu naikkan ke Standar dan Seperti tes asli.</li>
              <li>Jaga ritme sama dari awal sampai akhir agar kurva kerja stabil.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

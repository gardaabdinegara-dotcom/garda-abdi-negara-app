// Target latihan mingguan: kartu "Target minggu ini" di menu siswa, ringkasan target di rekap owner,
// dan bar kecil target per siswa. Tanpa style inline (CSP): cincin dan segmen digambar dengan atribut SVG.
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { JENIS_INFO } from "@/lib/core/latihan";
import { menitTarget, namaTarget, type ProgresTarget, type RingkasTargetKelompok, type StatusHari, type TargetLatihan } from "@/lib/core/latihan-target";
import type { TargetSiswa } from "@/lib/server/latihan";
import { TargetSheet } from "./latihan-target-sheet";

const HARI_PANJANG: Record<string, string> = { Sen: "Senin", Sel: "Selasa", Rab: "Rabu", Kam: "Kamis", Jum: "Jumat", Sab: "Sabtu", Min: "Minggu" };
const STATUS_TEKS: Record<StatusHari, string> = { target: "latihan sesuai target", lain: "latihan lain", kosong: "belum latihan" };

const tgl = (tanggal: string, opsi: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("id-ID", { ...opsi, timeZone: "UTC" }).format(new Date(`${tanggal}T00:00:00Z`)).replace(".", "");

/** "16 sampai 22 Nov", atau "30 Nov sampai 6 Des" bila beda bulan. */
export function rentangMinggu(dari: string, sampai: string): string {
  const akhir = tgl(sampai, { day: "numeric", month: "short" });
  return dari.slice(0, 7) === sampai.slice(0, 7) ? `${Number(dari.slice(8))} sampai ${akhir}` : `${tgl(dari, { day: "numeric", month: "short" })} sampai ${akhir}`;
}

/** "Kraepelin Standar · 3× seminggu". */
export const judulTarget = (target: TargetLatihan) => `${namaTarget(target)} · ${target.kali}× seminggu`;

/** Cincin x/N bersegmen (satu segmen per hari target). */
function Cincin({ selesai, kali }: { selesai: number; kali: number }) {
  const r = 26;
  const keliling = 2 * Math.PI * r;
  const celah = kali > 1 ? 6 : 0;
  const ruas = keliling / kali - celah;
  const isi = Math.min(selesai, kali);
  const putar = -90 + ((celah / 2) / keliling) * 360;
  const pola = (n: number) => {
    if (n >= kali) return `${ruas.toFixed(2)} ${celah}`;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(ruas.toFixed(2), String(i === n - 1 ? (keliling - n * (ruas + celah) + celah).toFixed(2) : celah));
    return parts.join(" ");
  };
  return (
    <svg className="lt-ring" viewBox="0 0 64 64" role="img" aria-label={`${Math.min(selesai, kali)} dari ${kali} hari target minggu ini`}>
      <circle className="lt-ring-bg" cx="32" cy="32" r={r} strokeDasharray={pola(kali)} transform={`rotate(${putar.toFixed(2)} 32 32)`} />
      {isi > 0 ? <circle className="lt-ring-fill" cx="32" cy="32" r={r} strokeDasharray={pola(isi)} transform={`rotate(${putar.toFixed(2)} 32 32)`} /> : null}
      <text className="lt-ring-text" x="32" y="37.5" textAnchor="middle">
        {Math.min(selesai, kali)}/{kali}
      </text>
    </svg>
  );
}

function Centang() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 12.5l4 4 8-9" />
    </svg>
  );
}

function Api() {
  return (
    <svg className="lt-api" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3c.6 3.2 4.8 5.3 4.8 10.2A4.8 4.8 0 0 1 12 18 4.8 4.8 0 0 1 7.2 13.2c0-2.4 1.3-3.9 2.3-4.9.2 1.6.9 2.6 1.9 3.1C11.2 8.6 11.6 5.6 12 3z" />
      <path d="M12 21c-3.9 0-6.5-2.6-6.5-6" />
    </svg>
  );
}

function pesanKurang(p: ProgresTarget): { teks: string; tone: "ok" | "up" | "warn" } {
  if (p.terpenuhi) return { teks: "Target minggu ini tercapai", tone: "ok" };
  const hariIniSudah = p.hari.find((h) => h.hariIni)?.status === "target";
  const peluang = p.sisaHari + (hariIniSudah ? 0 : 1);
  if (p.kurang <= peluang) return { teks: `Tinggal ${p.kurang} lagi sampai Minggu`, tone: "up" };
  return { teks: `Masih kurang ${p.kurang}. Tetap latihan sampai Minggu`, tone: "warn" };
}

function tombolKerjakan(target: TargetLatihan): { href: string; teks: string } {
  if (!target.jenis) return { href: "#pilih-latihan", teks: "Pilih latihan di bawah" };
  const nama = namaTarget(target);
  const menit = menitTarget(target);
  return {
    href: `/kerjakan/${target.jenis}${target.durasi ? `?durasi=${target.durasi}` : ""}`,
    teks: `Kerjakan ${nama}${menit ? ` · ${menit} menit` : ""}`,
  };
}

/** Kartu "Target minggu ini" di menu Latihan siswa. */
export function TargetSiswaCard({ target: p }: { target: TargetSiswa }) {
  const nama = namaTarget(p.target);
  const pesan = pesanKurang(p);
  const tombol = tombolKerjakan(p.target);
  return (
    <section className="card lt-card lt-tgt" aria-labelledby="lt-tgt-h">
      <div className="lt-tgt-top">
        <h2 id="lt-tgt-h" className="lt-eyebrow">
          Target minggu ini
        </h2>
        <span>{rentangMinggu(p.dari, p.sampai)}</span>
      </div>
      <div className="lt-tgt-main">
        <Cincin selesai={p.selesai} kali={p.target.kali} />
        <div className="lt-tgt-info">
          <b>{nama}</b>
          <span>{p.target.kali} kali seminggu · dari pelatih</span>
          <span className={`lt-tgt-msg is-${pesan.tone}`}>{pesan.teks}</span>
        </div>
      </div>
      <ol className="lt-days" aria-label="Latihan per hari minggu ini">
        {p.hari.map((h) => (
          <li key={h.tanggal} className={`${h.hariIni ? "is-now" : ""}${h.nanti ? " is-later" : ""}`.trim() || undefined}>
            <span className={`lt-day is-${h.status}`} role="img" aria-label={`${HARI_PANJANG[h.label]}${h.hariIni ? " (hari ini)" : ""}: ${h.nanti ? "belum dijalani" : STATUS_TEKS[h.status]}`}>
              {h.status === "target" ? <Centang /> : null}
            </span>
            <small aria-hidden="true">{h.label}</small>
          </li>
        ))}
      </ol>
      <div className="lt-lgd" aria-hidden="true">
        <span>
          <i className="is-target" />
          {nama}
        </span>
        <span>
          <i className="is-lain" />
          Latihan lain
        </span>
      </div>
      <div className="lt-strk">
        <Api />
        <b>{p.beruntun ? `${p.beruntun} hari beruntun` : "Belum ada hari beruntun"}</b>
        <span>{p.rekor ? `Rekor ${p.rekor} hari` : "Mulai hari ini"}</span>
      </div>
      <Link className="btn btn-block lt-tgt-go" href={tombol.href}>
        {tombol.teks}
      </Link>
    </section>
  );
}

/** Bar kecil target per siswa di rekap owner: "1/3" dan segmen per hari. */
export function TargetMini({ p }: { p: ProgresTarget }) {
  const kali = p.target.kali;
  const isi = Math.min(p.selesai, kali);
  const tone = p.terpenuhi ? "ok" : p.selesai === 0 ? "r" : "o";
  const lebar = kali * 10 - 2;
  return (
    <span className={`lp-tq is-${tone}`} title={`Target minggu ini: ${p.selesai} dari ${kali} hari`}>
      <b>
        {isi}/{kali}
      </b>
      <svg viewBox={`0 0 ${lebar} 6`} aria-hidden="true" preserveAspectRatio="none">
        {Array.from({ length: kali }, (_, i) => (
          <rect key={i} className={i < isi ? "f" : undefined} x={i * 10} y="0" width="8" height="6" rx="2" />
        ))}
      </svg>
    </span>
  );
}

/** Teks kecil di baris siswa bila belum ada latihan sesuai target tetapi ada latihan lain. */
export function teksLatihanLain(p: ProgresTarget): string | null {
  if (p.selesai > 0 || p.latihanLain === 0) return null;
  return `${p.latihanLain} latihan lain · ${p.jenisLain.map((j) => JENIS_INFO[j].nama).join(", ")}`;
}

export type FilterTarget = "belum" | "sudah" | null;

/** Ringkasan target di rekap owner, tombol Ubah (lembar target), dan saringan Belum/Sudah. */
export function TargetRingkasan({
  ringkas,
  siswaAktif,
  filter,
  href,
}: {
  ringkas: RingkasTargetKelompok | null;
  siswaAktif: number;
  filter: FilterTarget;
  href: (target: FilterTarget) => string;
}) {
  if (!ringkas) {
    return (
      <section className="card lp-card lp-tgt is-empty" aria-labelledby="judul-target-latihan">
        <div className="lp-tgt-head">
          <div>
            <span className="lp-eyebrow">Target latihan mingguan</span>
            <h2 id="judul-target-latihan">Belum ada target</h2>
            <p>Pasang satu target untuk semua siswa aktif: jenis, durasi, dan berapa kali per minggu. Siswa melihat progresnya di menu Latihan.</p>
          </div>
          <TargetSheet target={null} siswaAktif={siswaAktif} operationId={randomUUID()} label="Pasang target" />
        </div>
      </section>
    );
  }
  const belum = ringkas.total - ringkas.memenuhi;
  return (
    <section className="card lp-card lp-tgt" aria-labelledby="judul-target-latihan">
      <div className="lp-tgt-head">
        <div>
          <span className="lp-eyebrow">Target minggu ini</span>
          <h2 id="judul-target-latihan">{judulTarget(ringkas.target)}</h2>
          <p>{rentangMinggu(ringkas.dari, ringkas.sampai)} · semua siswa aktif</p>
        </div>
        <TargetSheet target={ringkas.target} siswaAktif={siswaAktif} operationId={randomUUID()} label="Ubah" />
      </div>
      <meter className="lp-tgt-bar" min={0} max={Math.max(ringkas.total, 1)} value={ringkas.memenuhi} aria-label={`${ringkas.memenuhi} dari ${ringkas.total} siswa memenuhi target`} />
      <div className="lp-tgt-foot">
        <span>
          <b>{ringkas.memenuhi}</b> dari {ringkas.total} siswa sudah memenuhi
        </span>
        <span className="muted">{ringkas.sisaHari ? `sisa ${ringkas.sisaHari} hari` : "hari terakhir"}</span>
      </div>
      <nav className="lp-tgt-chips" aria-label="Saring siswa menurut target">
        <Link href={href(null)} prefetch={false} scroll={false} aria-current={filter === null ? "true" : undefined}>
          Semua · {ringkas.total}
        </Link>
        <Link href={href("belum")} prefetch={false} scroll={false} aria-current={filter === "belum" ? "true" : undefined}>
          Belum memenuhi · {belum}
        </Link>
        <Link href={href("sudah")} prefetch={false} scroll={false} aria-current={filter === "sudah" ? "true" : undefined}>
          Sudah · {ringkas.memenuhi}
        </Link>
      </nav>
    </section>
  );
}

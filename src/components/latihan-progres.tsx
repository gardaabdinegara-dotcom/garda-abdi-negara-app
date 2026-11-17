// Progres latihan psikotes satu siswa (desain "Progres siswa"): pilihan jenis, grafik skor gabungan antarlatihan,
// bar progres per aspek (latihan pertama dibanding terakhir), dan riwayat yang menuju halaman hasil.
// Dipakai siswa ("Progres saya") dan owner/admin (progres satu siswa). Grafik memakai SVG, batang memakai <meter>;
// semua warna lewat kelas CSS (tanpa style inline karena CSP).
import Link from "next/link";
import { DURASI_LABEL, isJenis, JENIS_INFO, JENIS_LATIHAN, PRESET, type JenisLatihan } from "@/lib/core/latihan";
import { daysBetween, type ProgresLatihan, type RekapBaris, type RingkasJenis } from "@/lib/core/latihan-rekap";
import type { Latihan } from "@/lib/core/latihan-simpan";
import { Icon } from "./icon";
import { SamIcon } from "./samapta-icon";
import { Badge, Empty, PageHead } from "./ui";

// ---------------------------------------------------------------- Pembantu tampilan (dipakai juga rekap owner)

/** "Angka hilang" → "Angka" untuk tombol jenis yang sempit. */
export const namaPendek = (jenis: JenisLatihan) => JENIS_INFO[jenis].nama.split(" ")[0]!;

const angka = (value: number, digits = 1) => value.toLocaleString("id-ID", { maximumFractionDigits: digits });

function tanggal(value: string, opsi: Intl.DateTimeFormatOptions): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value || "-";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", ...opsi }).format(date).replace(".", "");
}
/** "2026-11-17" → "17 Nov". */
export const tanggalPendek = (value: string) => tanggal(value, { day: "numeric", month: "short" });

export function teksHariSejak(hari: number | null): string {
  if (hari === null) return "-";
  if (hari <= 0) return "hari ini";
  if (hari === 1) return "kemarin";
  return `${hari} hari lalu`;
}

export function HariSejak({ hari }: { hari: number | null }) {
  return <>{teksHariSejak(hari)}</>;
}

/** Penanda perhatian di rekap: skor turun, lama tidak latihan, atau belum pernah latihan. */
export function TandaBadge({ baris }: { baris: Pick<RekapBaris, "tanda" | "tren" | "hariSejak"> }) {
  if (baris.tanda === "turun") return <Badge tone="danger">Skor turun {Math.abs(baris.tren ?? 0)}</Badge>;
  if (baris.tanda === "lama") return <Badge tone="warning">{baris.hariSejak} hari tidak latihan</Badge>;
  if (baris.tanda === "belum") return <Badge tone="info">Belum pernah latihan</Badge>;
  return null;
}

/** Naik/turun skor dibanding latihan sebelumnya pada jenis yang sama. Null = latihan pertama jenis itu. */
export function TrenPill({ tren }: { tren: number | null }) {
  if (tren === null) {
    return (
      <span className="lp-tren is-new" title="Latihan pertama untuk jenis ini">
        baru
      </span>
    );
  }
  const arah = tren > 0 ? "up" : tren < 0 ? "down" : "flat";
  const label = tren > 0 ? `naik ${tren} poin` : tren < 0 ? `turun ${Math.abs(tren)} poin` : "sama dengan latihan sebelumnya";
  return (
    <span className={`lp-tren is-${arah}`} aria-label={label} title={label}>
      {tren > 0 ? "▲" : tren < 0 ? "▼" : "="} {Math.abs(tren)}
    </span>
  );
}

// ---------------------------------------------------------------- Grafik skor

const MAKS_TITIK = 20;

/** Garis skor gabungan dari latihan ke latihan. Dua ukuran agar teks tetap terbaca di ponsel dan layar lebar. */
export function GrafikSkor({ urut, nama }: { urut: readonly Latihan[]; nama: string }) {
  const data = urut.slice(-MAKS_TITIK);
  const label = `Skor ${nama} ${data.length} latihan terakhir: ${data.map((l) => l.skor).join(", ")}`;
  return (
    <div className="lp-chart">
      <Garis data={data} w={340} h={176} semuaLabel={data.length <= 10} className="lp-chart-sm" label={label} />
      <Garis data={data} w={640} h={232} semuaLabel={data.length <= 16} className="lp-chart-lg" label={label} />
    </div>
  );
}

function Garis({ data, w, h, semuaLabel, className, label }: { data: readonly Latihan[]; w: number; h: number; semuaLabel: boolean; className: string; label: string }) {
  const padL = 30;
  const padR = 16;
  const sisi = 14; // jarak titik pertama/terakhir dari tepi garis bantu agar label tidak menabrak angka sumbu
  const padT = 22;
  const padB = 26;
  if (data.length === 0) return null;
  const skor = data.map((l) => l.skor);
  const min = Math.min(...skor);
  const max = Math.max(...skor);
  let lo = Math.max(0, Math.floor((min - 5) / 10) * 10);
  let hi = Math.min(100, Math.ceil((max + 5) / 10) * 10);
  if (hi - lo < 20) {
    if (hi <= 90) hi += 10;
    if (hi - lo < 20) lo = Math.max(0, lo - 10);
  }
  const n = data.length;
  const x = (i: number) => (n === 1 ? (padL + w - padR) / 2 : padL + sisi + (i * (w - padL - padR - 2 * sisi)) / (n - 1));
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (h - padT - padB);
  const tengah = Math.round((lo + hi) / 2);
  const titik = data.map((l, i) => [x(i), y(l.skor)] as const);
  const garis = titik.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const dasar = y(lo).toFixed(1);
  const area = n > 1 ? `M${titik[0]![0].toFixed(1)},${dasar} L${garis.replace(/ /g, " L")} L${titik[n - 1]![0].toFixed(1)},${dasar} Z` : "";
  const iMax = skor.indexOf(max);
  const tampil = (i: number) => semuaLabel || i === 0 || i === n - 1 || i === iMax;

  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {[lo, tengah, hi].map((t) => (
        <g key={t}>
          <line className="lp-g-grid" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
          <text className="lp-g-tick" x={padL - 7} y={y(t) + 3.5} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {area ? <path className="lp-g-area" d={area} /> : null}
      {n > 1 ? <polyline className="lp-g-line" points={garis} /> : null}
      {titik.map(([px, py], i) => (
        <circle key={data[i]!.latihan_id} className={i === n - 1 ? "lp-g-dot is-last" : "lp-g-dot"} cx={px} cy={py} r={i === n - 1 ? 5 : 3.5} />
      ))}
      {titik.map(([px, py], i) =>
        tampil(i) ? (
          <text key={`v-${data[i]!.latihan_id}`} className={i === n - 1 ? "lp-g-val is-last" : "lp-g-val"} x={px} y={py - 10 < 12 ? py + 18 : py - 10} textAnchor="middle">
            {skor[i]}
          </text>
        ) : null,
      )}
      <text className="lp-g-tick" x={x(0)} y={h - 6} textAnchor={n === 1 ? "middle" : "start"}>
        {tanggalPendek(data[0]!.tanggal)}
      </text>
      {n > 1 ? (
        <text className="lp-g-tick" x={x(n - 1)} y={h - 6} textAnchor="end">
          {tanggalPendek(data[n - 1]!.tanggal)}
        </text>
      ) : null}
    </svg>
  );
}

// ---------------------------------------------------------------- Halaman progres

const ASPEK = [
  { key: "ketelitian", nama: "Ketelitian" },
  { key: "kecepatan", nama: "Kecepatan" },
  { key: "stabilitas", nama: "Stabilitas" },
  { key: "performa", nama: "Performa" },
] as const;

function nilaiMentah(l: Latihan, key: (typeof ASPEK)[number]["key"]): string {
  if (key === "ketelitian") return `${angka(l.ketelitian)}% benar`;
  if (key === "kecepatan") return `${angka(l.kecepatan)} jawaban/menit`;
  if (key === "stabilitas") return `simpangan ${angka(l.stabilitas)}%`;
  return `kurva ${l.performa > 0 ? "+" : ""}${angka(l.performa)}%`;
}

/** Jenis yang dibuka: dari ?jenis=, bila kosong jenis latihan terakhir, bila belum ada latihan Kraepelin. */
export function jenisAwal(progres: Pick<ProgresLatihan, "riwayat">, value: string | string[] | undefined): JenisLatihan {
  if (isJenis(value)) return value;
  return progres.riwayat[0]?.jenis ?? "kraepelin";
}

const hrefHasil = (l: Latihan) => `/latihan/hasil/${encodeURIComponent(l.latihan_id)}`;

export function ProgresLatihanView({ progres, jenis, basePath, pemilik }: { progres: ProgresLatihan; jenis: JenisLatihan; basePath: string; pemilik: boolean }) {
  const { student, riwayat, perJenis, mingguIni, hariIni } = progres;
  const r = perJenis[jenis];
  const terakhir = riwayat[0] ?? null;
  const hariSejak = terakhir?.tanggal ? Math.max(0, daysBetween(terakhir.tanggal, hariIni)) : null;
  const namaDepan = student.nama.trim().split(/\s+/)[0] ?? student.nama;

  const head = pemilik ? (
    <PageHead
      back={{ href: "/latihan", label: "Latihan siswa" }}
      eyebrow={student.kode_siswa}
      title={student.nama}
      description="Progres latihan psikotes siswa ini."
      actions={
        <Link className="btn btn-secondary btn-sm" href={`/siswa/${encodeURIComponent(student.siswa_id)}`}>
          <Icon name="user" />
          Profil siswa
        </Link>
      }
    />
  ) : (
    <PageHead back={{ href: "/latihan", label: "Latihan" }} title="Progres saya" description={`${student.nama} · ${student.kode_siswa}`} />
  );

  if (riwayat.length === 0) {
    return (
      <div className="page lp-page">
        {head}
        <section className="card lp-card">
          {pemilik ? (
            <Empty title={`${namaDepan} belum pernah latihan`}>Progres muncul di sini setelah siswa mengerjakan latihan dari menu Latihan di HP-nya.</Empty>
          ) : (
            <Empty title="Belum ada latihan">
              <span className="lp-empty-text">Kerjakan latihan pertama dari menu Latihan. Skor dan progresnya muncul di sini.</span>
              <Link className="btn" href="/latihan">
                Mulai latihan
              </Link>
            </Empty>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page lp-page">
      {head}

      <div className="lp-kv" aria-label="Ringkasan latihan">
        <div>
          <b>{riwayat.length}</b>
          <span>latihan</span>
        </div>
        <div>
          <b>{mingguIni}</b>
          <span>minggu ini</span>
        </div>
        <div>
          <b className="lp-kv-text">{teksHariSejak(hariSejak)}</b>
          <span>terakhir latihan</span>
        </div>
      </div>

      <nav className="lp-jenis" aria-label="Pilih jenis latihan">
        {JENIS_LATIHAN.map((j) => (
          <Link key={j} href={`${basePath}?jenis=${j}`} aria-current={j === jenis ? "page" : undefined} scroll={false}>
            <b>{namaPendek(j)}</b>
            <span>{perJenis[j].jumlah ? `${perJenis[j].jumlah}×` : "belum"}</span>
          </Link>
        ))}
      </nav>

      {r.jumlah === 0 ? (
        <section className="card lp-card">
          <Empty title={`Belum ada latihan ${JENIS_INFO[jenis].nama}`}>
            {pemilik ? (
              `${namaDepan} belum mencoba jenis ini. Pilih jenis lain di atas untuk melihat progresnya.`
            ) : (
              <>
                <span className="lp-empty-text">{JENIS_INFO[jenis].ket}</span>
                <Link className="btn" href="/latihan">
                  Mulai latihan
                </Link>
              </>
            )}
          </Empty>
        </section>
      ) : (
        <div className="lp-grid">
          <ChartCard r={r} />
          <AspekCard r={r} />
          <RiwayatCard r={r} />
        </div>
      )}
    </div>
  );
}

function ChartCard({ r }: { r: RingkasJenis }) {
  const nama = JENIS_INFO[r.jenis].nama;
  const awal = r.pertama!;
  const akhir = r.terakhir!;
  const selisih = akhir.skor - awal.skor;
  const sub =
    r.jumlah === 1
      ? "1 latihan. Grafik terisi setelah latihan berikutnya."
      : `${r.jumlah > MAKS_TITIK ? `${MAKS_TITIK} dari ${r.jumlah}` : r.jumlah} latihan · ${
          selisih > 0 ? `naik ${selisih} poin` : selisih < 0 ? `turun ${Math.abs(selisih)} poin` : "skor sama"
        } dari latihan pertama`;
  return (
    <section className="card lp-card lp-chart-card" aria-labelledby="lp-chart-judul">
      <div className="lp-card-head">
        <div>
          <h2 id="lp-chart-judul">Skor gabungan {nama}</h2>
          <p>{sub}</p>
        </div>
        {r.terbaik !== null ? <span className="lp-best">Terbaik {r.terbaik}</span> : null}
      </div>
      <GrafikSkor urut={r.urut} nama={nama} />
    </section>
  );
}

function AspekCard({ r }: { r: RingkasJenis }) {
  const awal = r.pertama!;
  const akhir = r.terakhir!;
  const banding = r.jumlah > 1;
  return (
    <section className="card lp-card lp-asp-card" aria-labelledby="lp-asp-judul">
      <div className="lp-card-head">
        <div>
          <h2 id="lp-asp-judul">Bar progres per aspek</h2>
          <p>{banding ? "Latihan pertama dibanding latihan terakhir." : "Dari latihan pertama. Perbandingan muncul setelah latihan kedua."}</p>
        </div>
      </div>
      <ul className="lp-asp">
        {ASPEK.map((a) => {
          const v0 = Math.round(awal.skorAspek[a.key]);
          const v1 = Math.round(akhir.skorAspek[a.key]);
          const d = v1 - v0;
          return (
            <li key={a.key}>
              <div className="lp-asp-top">
                <b>{a.nama}</b>
                <span className="lp-asp-v">{banding ? `${v0} → ${v1}` : v1}</span>
                {banding ? (
                  <span className={`lp-tren is-${d > 0 ? "up" : d < 0 ? "down" : "flat"}`}>
                    {d > 0 ? "+" : ""}
                    {d}
                  </span>
                ) : null}
              </div>
              <meter className="lp-bar is-akhir" min={0} max={100} value={v1} aria-label={`${a.nama} latihan terakhir ${v1} dari 100`} />
              {banding ? <meter className="lp-bar is-awal" min={0} max={100} value={v0} aria-label={`${a.nama} latihan pertama ${v0} dari 100`} /> : null}
              <span className="lp-asp-raw">Terakhir: {nilaiMentah(akhir, a.key)}</span>
            </li>
          );
        })}
      </ul>
      {banding ? (
        <p className="lp-legend">
          <span>
            <i className="is-akhir" aria-hidden="true" />
            Terakhir, {tanggalPendek(akhir.tanggal)}
          </span>
          <span>
            <i className="is-awal" aria-hidden="true" />
            Pertama, {tanggalPendek(awal.tanggal)}
          </span>
        </p>
      ) : null}
    </section>
  );
}

const TAMPIL_RIWAYAT = 8;

function RiwayatCard({ r }: { r: RingkasJenis }) {
  const nama = JENIS_INFO[r.jenis].nama;
  // Terbaru dulu, dengan selisih terhadap latihan sebelumnya pada jenis yang sama.
  const items = r.urut.map((l, i) => ({ l, tren: i > 0 ? l.skor - r.urut[i - 1]!.skor : null })).reverse();
  const awal = items.slice(0, TAMPIL_RIWAYAT);
  const sisa = items.slice(TAMPIL_RIWAYAT);
  return (
    <section className="card lp-card lp-hist-card" aria-labelledby="lp-hist-judul">
      <div className="lp-card-head">
        <div>
          <h2 id="lp-hist-judul">Riwayat {nama}</h2>
          <p>Ketuk untuk melihat hasil lengkap.</p>
        </div>
        <Badge>{r.jumlah} latihan</Badge>
      </div>
      <RiwayatList items={awal} />
      {sisa.length ? (
        <details className="lp-more">
          <summary>
            Tampilkan {sisa.length} latihan lebih lama
            <SamIcon name="down" />
          </summary>
          <RiwayatList items={sisa} />
        </details>
      ) : null}
    </section>
  );
}

function RiwayatList({ items }: { items: { l: Latihan; tren: number | null }[] }) {
  return (
    <ul className="lp-hist">
      {items.map(({ l, tren }) => {
        const preset = PRESET[l.jenis][l.durasi];
        const bagian = JENIS_INFO[l.jenis].bagian;
        return (
          <li key={l.latihan_id}>
            <Link href={hrefHasil(l)}>
              <span className="lp-hist-d" aria-hidden="true">
                <b>{tanggal(l.tanggal, { day: "numeric" })}</b>
                <span>{tanggal(l.tanggal, { month: "short" })}</span>
              </span>
              <span className="lp-hist-main">
                <b>
                  <span className="sr-only">{tanggal(l.tanggal, { day: "numeric", month: "long" })}, </span>
                  {DURASI_LABEL[l.durasi]}
                  <em>
                    {" "}
                    · {Math.min(l.seri.length, preset.bagian)} {bagian}
                  </em>
                </b>
                <span>
                  {l.dijawab} dijawab · {angka(l.ketelitian)}% benar
                </span>
              </span>
              <span className="lp-hist-end">
                <b className="lp-hist-skor" aria-label={`Skor ${l.skor}`}>
                  {l.skor}
                </b>
                <TrenPill tren={tren} />
              </span>
              <SamIcon name="right" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

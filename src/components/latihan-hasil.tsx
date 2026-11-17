// Tampilan hasil satu latihan psikotes: skor gabungan, empat aspek, kurva kerja, dan perbandingan dengan latihan
// sebelumnya. Dipakai halaman hasil (server) dan hasil langsung di layar latihan (mode coba, atau saat menyimpan).
// Tanpa hook dan tanpa impor server, jadi aman di kedua sisi. Lebar batang memakai <meter> dan SVG (CSP).
import { DURASI_LABEL, JENIS_INFO, type DurasiLatihan, type HasilLatihan, type JenisLatihan, type Kategori } from "@/lib/core/latihan";

/** Ikon teks tiap jenis latihan (dipakai menu, layar persiapan, dan hasil). */
export const IKON_LATIHAN: Record<JenisLatihan, string> = { kraepelin: "+", pauli: "Σ", angka: "7?", simbol: "★?" };

export interface DataHasil extends HasilLatihan {
  jenis: JenisLatihan;
  durasi: DurasiLatihan;
  detik: number;
  /** Waktu mulai (ISO). */
  mulai: string;
}

export interface DataPembanding extends HasilLatihan {
  durasi?: DurasiLatihan;
  mulai: string;
}

const fmt = (v: number, d = 1) => v.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

/** "17 Nov 2026, 10.12" (WIB). */
export function waktuLatihan(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
}

/** Selisih bertanda: "+2,3", "−1,0", "0". */
function selisih(v: number, d = 1): string {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${fmt(Math.abs(r), d)}`;
}

type Nada = "ok" | "warn" | "bad";
const BADGE: Record<Nada | "info" | "netral", string> = { ok: "badge badge-success", warn: "badge badge-warning", bad: "badge badge-danger", info: "badge badge-info", netral: "badge" };
const nadaSkor = (v: number): Nada => (v < 45 ? "bad" : v < 65 ? "warn" : "ok");

type KunciAspek = "ketelitian" | "kecepatan" | "stabilitas" | "performa";
const ASPEK: { key: KunciAspek; nama: string; nilai: (h: HasilLatihan) => string; lebihBaik: 1 | -1 }[] = [
  { key: "ketelitian", nama: "Ketelitian", nilai: (h) => `${fmt(h.ketelitian)}%`, lebihBaik: 1 },
  { key: "kecepatan", nama: "Kecepatan", nilai: (h) => `${fmt(h.kecepatan)}/menit`, lebihBaik: 1 },
  { key: "stabilitas", nama: "Stabilitas", nilai: (h) => `DR ${fmt(h.stabilitas)}%`, lebihBaik: -1 },
  { key: "performa", nama: "Performa", nilai: (h) => `${h.performa > 0 ? "+" : ""}${fmt(h.performa)}%`, lebihBaik: 1 },
];

function pesanSkor(skor: number): string {
  if (skor >= 70) return "Bagus. Pertahankan ritme dan ketelitian.";
  if (skor >= 50) return "Cukup. Fokus pada aspek yang berwarna oranye atau merah.";
  return "Perlu banyak latihan. Mulai dari durasi singkat, lalu naikkan bertahap.";
}

function Cincin({ skor }: { skor: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, skor));
  return (
    <svg className="lt-ring" viewBox="0 0 92 92" aria-hidden="true">
      <circle className="lt-ring-trk" cx="46" cy="46" r={r} />
      <circle className={`lt-ring-val is-${nadaSkor(v)}`} cx="46" cy="46" r={r} strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 46 46)" />
      <text className="lt-ring-t" x="46" y="47" textAnchor="middle" dominantBaseline="central">
        {skor}
      </text>
    </svg>
  );
}

/** Kurva kerja: batang jumlah benar per bagian dan garis putus rata-rata. */
export function KurvaKerja({ kurva, satuan }: { kurva: readonly number[]; satuan: string }) {
  const W = 320;
  const H = 150;
  const kiri = 8;
  const atas = 18;
  const bawah = 20;
  const n = Math.max(kurva.length, 1);
  const max = Math.max(...kurva, 1);
  const lebar = (W - kiri * 2) / n;
  const sela = Math.min(6, lebar * 0.25);
  const tinggi = H - atas - bawah;
  const rata = kurva.reduce((a, b) => a + b, 0) / n;
  const yRata = atas + tinggi - (rata / max) * tinggi;
  const nilai = n <= 12;
  const langkah = n <= 12 ? 1 : Math.ceil(n / 9 / 5) * 5;
  return (
    <svg
      className="lt-kurva"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Kurva kerja, jawaban benar per ${satuan}: ${kurva.join(", ")}. Rata-rata ${fmt(rata)}.`}
    >
      <line className="lt-k-base" x1={kiri} x2={W - kiri} y1={atas + tinggi} y2={atas + tinggi} />
      {kurva.map((v, i) => {
        const x = kiri + i * lebar + sela / 2;
        const w = Math.max(1, lebar - sela);
        const h = (v / max) * tinggi;
        const tampilX = n <= 12 || i === 0 || (i + 1) % langkah === 0;
        return (
          <g key={i}>
            <rect className="lt-k-bar" x={x} y={atas + tinggi - h} width={w} height={h} rx={Math.min(4, w / 3)} />
            {nilai ? (
              <text className="lt-k-val" x={x + w / 2} y={atas + tinggi - h - 5} textAnchor="middle">
                {v}
              </text>
            ) : null}
            {tampilX ? (
              <text className="lt-k-x" x={x + w / 2} y={H - 6} textAnchor="middle">
                {i + 1}
              </text>
            ) : null}
          </g>
        );
      })}
      <line className="lt-k-avg" x1={kiri} x2={W - kiri} y1={yRata} y2={yRata} />
    </svg>
  );
}

function Aspek({ data, sebelumnya }: { data: DataHasil; sebelumnya: DataPembanding | null }) {
  const resmi = data.kategori;
  return (
    <section className="card lt-card" aria-labelledby="lt-aspek-h">
      <h2 id="lt-aspek-h">Empat aspek</h2>
      <ul className="lt-asp">
        {ASPEK.map((a) => {
          const skor = data.skorAspek[a.key];
          const kat: Kategori | null = resmi ? resmi[a.key] : null;
          let pill: { cls: string; teks: string };
          if (kat) pill = { cls: BADGE[kat.tone], teks: kat.nama };
          else if (!sebelumnya) pill = { cls: BADGE.info, teks: "Latihan pertama" };
          else {
            const d = skor - sebelumnya.skorAspek[a.key];
            pill = Math.abs(d) < 0.5 ? { cls: BADGE.netral, teks: "Sama dengan latihan lalu" } : d > 0 ? { cls: BADGE.ok, teks: `Naik ${fmt(d, 0)} poin` } : { cls: BADGE.warn, teks: `Turun ${fmt(-d, 0)} poin` };
          }
          const nada: Nada = kat ? kat.tone : nadaSkor(skor);
          return (
            <li key={a.key}>
              <div className="lt-asp-top">
                <span>
                  <b>{a.nama}</b> · <span className="n">{a.nilai(data)}</span>
                </span>
                <span className={pill.cls}>{pill.teks}</span>
              </div>
              <meter className={`lt-meter is-${nada}`} min={0} max={100} value={skor} aria-label={`Skor ${a.nama.toLowerCase()} ${fmt(skor)} dari 100`} />
              {kat ? <p className="lt-asp-saran">{kat.saran}</p> : null}
            </li>
          );
        })}
      </ul>
      <p className="lt-foot">
        {resmi
          ? "Kategori memakai tabel Kraepelin/Pauli. DR (simpangan jumlah benar antarbagian) makin kecil makin stabil; performa adalah tren dari awal ke akhir."
          : "Angka dan simbol hilang belum punya tabel norma resmi, jadi tiap aspek dibandingkan dengan latihanmu sebelumnya. DR makin kecil makin stabil."}
      </p>
    </section>
  );
}

function Banding({ data, sebelumnya }: { data: DataHasil; sebelumnya: DataPembanding | null }) {
  const nama = JENIS_INFO[data.jenis].nama;
  if (!sebelumnya) {
    return (
      <section className="card lt-card" aria-labelledby="lt-banding-h">
        <h2 id="lt-banding-h">Dibanding latihan sebelumnya</h2>
        <p className="lt-sub">Ini latihan {nama} pertama, jadi belum ada pembanding. Ulangi latihan ini untuk melihat perkembangan.</p>
      </section>
    );
  }
  const baris: { nama: string; lalu: string; kini: string; d: number; teks: string }[] = [
    { nama: "Skor gabungan", lalu: String(sebelumnya.skor), kini: String(data.skor), d: data.skor - sebelumnya.skor, teks: selisih(data.skor - sebelumnya.skor, 0) },
    ...ASPEK.map((a) => {
      const d = data[a.key] - sebelumnya[a.key];
      return { nama: a.nama, lalu: a.nilai(sebelumnya), kini: a.nilai(data), d: d * a.lebihBaik, teks: selisih(d) };
    }),
  ];
  return (
    <section className="card lt-card" aria-labelledby="lt-banding-h">
      <div>
        <h2 id="lt-banding-h">Dibanding latihan sebelumnya</h2>
        <p className="lt-sub">
          {waktuLatihan(sebelumnya.mulai)}
          {sebelumnya.durasi ? ` · ${DURASI_LABEL[sebelumnya.durasi]}` : ""}
        </p>
      </div>
      <table className="lt-banding">
        <thead>
          <tr>
            <th scope="col">Aspek</th>
            <th scope="col">Lalu</th>
            <th scope="col">Kini</th>
            <th scope="col">Selisih</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b) => (
            <tr key={b.nama}>
              <th scope="row">{b.nama}</th>
              <td className="n">{b.lalu}</td>
              <td className="n">
                <b>{b.kini}</b>
              </td>
              <td className={`n lt-d ${Math.abs(b.d) < 0.05 ? "is-same" : b.d > 0 ? "is-up" : "is-down"}`}>{b.teks}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function LatihanHasil({
  data,
  sebelumnya,
  status,
  aksi,
}: {
  data: DataHasil;
  sebelumnya: DataPembanding | null;
  /** Keterangan di atas hasil, mis. status menyimpan atau "Tidak disimpan (mode coba)". */
  status?: React.ReactNode;
  aksi?: React.ReactNode;
}) {
  const info = JENIS_INFO[data.jenis];
  const d = sebelumnya ? data.skor - sebelumnya.skor : null;
  return (
    <div className="lt-hasil">
      {status ? <div className="lt-hasil-status">{status}</div> : null}
      <div className="lt-hasil-grid">
        <div className="lt-hasil-col">
          <section className="card lt-card lt-skor" aria-label="Skor gabungan">
            <Cincin skor={data.skor} />
            <div className="lt-skor-text">
              <h2>Skor gabungan</h2>
              <p>{pesanSkor(data.skor)}</p>
              <p className="lt-skor-pill">
                {d === null ? (
                  <span className={BADGE.info}>Latihan {info.nama} pertama</span>
                ) : d === 0 ? (
                  <span className={BADGE.netral}>Sama dengan latihan lalu</span>
                ) : (
                  <span className={d > 0 ? BADGE.ok : BADGE.bad}>
                    {d > 0 ? "▲" : "▼"} {Math.abs(d)} dari latihan lalu
                  </span>
                )}
              </p>
            </div>
          </section>
          <dl className="lt-kv">
            <div>
              <dt>dijawab</dt>
              <dd className="n">{data.dijawab}</dd>
            </div>
            <div>
              <dt>benar</dt>
              <dd className="n">{data.benar}</dd>
            </div>
            <div>
              <dt>salah</dt>
              <dd className="n">{data.salah}</dd>
            </div>
          </dl>
          <Aspek data={data} sebelumnya={sebelumnya} />
        </div>
        <div className="lt-hasil-col">
          <section className="card lt-card" aria-labelledby="lt-kurva-h">
            <div>
              <h2 id="lt-kurva-h">Kurva kerja</h2>
              <p className="lt-sub">
                Jawaban benar per {info.bagian}; garis putus = rata-rata.
              </p>
            </div>
            <KurvaKerja kurva={data.kurva.length ? data.kurva : [0]} satuan={info.bagian} />
          </section>
          <Banding data={data} sebelumnya={sebelumnya} />
          {aksi ? <div className="lt-aksi">{aksi}</div> : null}
        </div>
      </div>
    </div>
  );
}

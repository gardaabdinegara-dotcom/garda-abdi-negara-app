// Komponen bersama Tes Samapta: kartu hasil, rincian materi, badan & tensi, grafik perbandingan, dan donat klasifikasi.
// Grafik memakai atribut SVG dan kelas CSS (tanpa style inline) karena CSP melarang style inline.
import Link from "next/link";
import {
  KLASIFIKASI,
  POS,
  POS_INFO,
  TEST_STATUS_LABEL,
  type Klasifikasi,
  type Pos,
  type SamaptaSettings,
  type SamaptaStatus,
} from "@/lib/core/samapta";
import type { SamaptaEntry } from "@/lib/server/samapta";
import {
  fmt,
  KLAS_TONE,
  klasRanges,
  materiOf,
  renangText,
  type CompareGroup,
} from "@/app/(ruang)/samapta/samapta-ui";
import { Icon } from "./icon";
import { Badge } from "./ui";

export function SamaptaStatusBadge({ status }: { status: SamaptaStatus }) {
  return <Badge tone={status === "SELESAI" ? "success" : status === "DIBATALKAN" ? "danger" : "warning"}>{TEST_STATUS_LABEL[status]}</Badge>;
}

export function KlasBadge({ klas }: { klas: Klasifikasi | null }) {
  return klas ? <Badge tone={KLAS_TONE[klas]}>{klas}</Badge> : <Badge>Belum lengkap</Badge>;
}

const IMT_TONE: Record<string, "success" | "warning" | "danger"> = { Normal: "success", Kurus: "warning", Gemuk: "warning", Obesitas: "danger" };

/** Tiga kartu hasil (Garjas A, Garjas B, hasil akhir), plus peringkat bila diberikan. */
export function ResultCards({ entry, rank }: { entry: SamaptaEntry; rank?: { rank: number | null; total: number } }) {
  const { score, result } = entry;
  const nilaiB = [result.pull_nilai, result.situp_nilai, result.pushup_nilai, result.shuttle_nilai];
  const rumusB = nilaiB.every((v) => v !== null) ? `(${nilaiB.map((v) => fmt(v)).join(" + ")}) ÷ 4` : "Menunggu 4 materi B";
  return (
    <div className={`sam-res-grid${rank ? " four" : ""}`}>
      <div className="sam-res">
        <span>Garjas A · lari 12 menit</span>
        <b>{fmt(score.garjasA)}</b>
        <small>{result.lari_jarak !== null ? `${fmt(result.lari_jarak, 0)} meter` : "Belum diisi"}</small>
      </div>
      <div className="sam-res">
        <span>Garjas B · rata-rata 4 materi</span>
        <b>{fmt(score.garjasB)}</b>
        <small>{rumusB}</small>
      </div>
      <div className="sam-res is-main">
        <span>Hasil akhir · (A + B) ÷ 2</span>
        <b>{fmt(score.akhir)}</b>
        <KlasBadge klas={score.klas} />
      </div>
      {rank ? (
        <div className="sam-res">
          <span>Peringkat</span>
          <b>{rank.rank ?? "-"}</b>
          <small>{rank.rank ? `dari ${rank.total} peserta` : "Muncul setelah hasil akhir lengkap"}</small>
        </div>
      ) : null}
    </div>
  );
}

/** Tabel rincian: materi, hasil, nilai. Label Pull Up/Chinning mengikuti jenis kelamin. */
export function BreakdownTable({ entry }: { entry: SamaptaEntry }) {
  const renang = renangText(entry.result);
  return (
    <div className="table-wrap">
      <table className="data sam-rinci">
        <thead>
          <tr>
            <th>Materi</th>
            <th>Hasil</th>
            <th className="num">Nilai</th>
          </tr>
        </thead>
        <tbody>
          {materiOf(entry.result, entry.score.pullLabel).map((m) => (
            <tr key={m.key}>
              <td>{m.label}</td>
              <td>{m.hasil === "-" ? <span className="muted">Belum diisi</span> : m.hasil}</td>
              <td className="num">
                <b>{fmt(m.nilai)}</b>
              </td>
            </tr>
          ))}
          <tr>
            <td>Renang dasar 50 m</td>
            <td>{renang ?? <span className="muted">Belum diisi</span>}</td>
            <td className="num">
              <span className="muted small">Ketangkasan</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Tinggi/berat, IMT, tensi, riwayat kesehatan, dan keterangan. */
export function BodyFacts({ entry }: { entry: SamaptaEntry }) {
  const { result, score } = entry;
  const tensiDone = result.tensi.some((t) => t !== "");
  const riwayat = result.riwayat.filter((r) => r.trim() !== "");
  return (
    <dl className="sam-kv">
      <div>
        <dt>Tinggi / berat</dt>
        <dd>
          {result.tinggi_cm !== null ? `${fmt(result.tinggi_cm, 1)} cm` : "-"} / {result.berat_kg !== null ? `${fmt(result.berat_kg, 1)} kg` : "-"}
        </dd>
      </div>
      <div>
        <dt>IMT</dt>
        <dd className="row sam-gap6">
          {fmt(score.imt, 1)}
          {score.imtKlas ? <Badge tone={IMT_TONE[score.imtKlas] ?? "neutral"}>{score.imtKlas}</Badge> : null}
        </dd>
      </div>
      <div>
        <dt>Tensi I / II / III</dt>
        <dd className="sam-nums">{result.tensi.map((t) => t || "-").join(" · ")}</dd>
      </div>
      <div>
        <dt>Riwayat kesehatan 6 bulan</dt>
        <dd>{riwayat.length ? riwayat.join("; ") : tensiDone ? "Tidak ada" : "-"}</dd>
      </div>
      {result.keterangan ? (
        <div>
          <dt>Keterangan</dt>
          <dd>{result.keterangan}</dd>
        </div>
      ) : null}
    </dl>
  );
}

/** Batang berujung bulat di atas, rata di garis dasar. */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h);
  const base = y + h;
  return `M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${base}Z`;
}

/**
 * Grafik batang berpasangan 0–100: tes sebelumnya (abu, konteks) dan tes ini (hijau, ditonjolkan).
 * Angka hanya ditulis di batang tes ini; angka lengkap ada di tabel di bawah grafik.
 */
export function CompareBars({ groups, labelA, labelB, title }: { groups: CompareGroup[]; labelA: string; labelB: string; title: string }) {
  const width = 360;
  const height = 196;
  const left = 24;
  const top = 22;
  const base = 158;
  const groupW = (width - left) / Math.max(groups.length, 1);
  const barW = Math.min(20, (groupW - 12) / 2);
  const scale = (v: number) => ((base - top) * Math.max(0, Math.min(100, v))) / 100;
  const summary = groups.map((g) => `${g.label} ${fmt(g.a)} lalu ${fmt(g.b)}`).join(", ");
  return (
    <figure className="sam-figure">
      <svg className="sam-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${summary}`}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line className={v === 0 ? "sam-axis" : "sam-grid"} x1={left} x2={width} y1={base - scale(v)} y2={base - scale(v)} />
            <text className="sam-tick" x={left - 6} y={base - scale(v) + 3.5} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {groups.map((g, i) => {
          const cx = left + groupW * (i + 0.5);
          const xa = cx - barW - 1;
          const xb = cx + 1;
          const ha = g.a === null ? 0 : Math.max(2, scale(g.a));
          const hb = g.b === null ? 0 : Math.max(2, scale(g.b));
          return (
            <g key={g.label}>
              {g.a !== null ? (
                <path className="sam-bar-a" d={barPath(xa, base - ha, barW, ha)}>
                  <title>{`${labelA} · ${g.label}: ${fmt(g.a)}`}</title>
                </path>
              ) : null}
              {g.b !== null ? (
                <path className="sam-bar-b" d={barPath(xb, base - hb, barW, hb)}>
                  <title>{`${labelB} · ${g.label}: ${fmt(g.b)}`}</title>
                </path>
              ) : null}
              <text className="sam-val" x={xb + barW / 2} y={base - hb - 5} textAnchor="middle">
                {g.b === null ? "-" : fmt(Math.round(g.b), 0)}
              </text>
              <text className="sam-lbl" x={cx} y={base + 18} textAnchor="middle">
                {g.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sam-legend">
        <span>
          <i className="sam-dot sam-dot-a" aria-hidden="true" />
          {labelA}
        </span>
        <span>
          <i className="sam-dot sam-dot-b" aria-hidden="true" />
          {labelB}
        </span>
      </figcaption>
      <details className="sam-numbers">
        <summary>Lihat angkanya</summary>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Materi</th>
                <th className="num">{labelA}</th>
                <th className="num">{labelB}</th>
                <th className="num">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const d = g.a !== null && g.b !== null ? Math.round((g.b - g.a) * 100) / 100 : null;
                return (
                  <tr key={g.label}>
                    <td>{g.label}</td>
                    <td className="num">{fmt(g.a)}</td>
                    <td className="num">{fmt(g.b)}</td>
                    <td className="num">{d === null ? "-" : `${d > 0 ? "+" : ""}${fmt(d)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Donat sebaran klasifikasi dengan warna tetap per kelas dan batas dari pengaturan. */
export function KlasDonut({ klas, settings, unit = "siswa" }: { klas: Record<Klasifikasi, number>; settings: Pick<SamaptaSettings, "baik_sekali" | "baik" | "cukup">; unit?: string }) {
  const ranges = klasRanges(settings);
  const total = KLASIFIKASI.reduce((sum, k) => sum + klas[k], 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  const used = KLASIFIKASI.filter((k) => klas[k] > 0).length;
  const gap = used > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="sam-donut">
      <svg viewBox="0 0 120 120" width="128" height="128" role="img" aria-label={`Sebaran klasifikasi: ${KLASIFIKASI.map((k) => `${k} ${klas[k]}`).join(", ")}`}>
        <circle className="ring-track" cx="60" cy="60" r={r} fill="none" strokeWidth="16" />
        {total > 0
          ? KLASIFIKASI.map((k, i) => {
              const len = (klas[k] / total) * c;
              const el =
                len > 0 ? (
                  <circle
                    key={k}
                    className={`sam-arc sam-k${i + 1}`}
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    strokeWidth="16"
                    strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
                    strokeDashoffset={-offset}
                    transform="rotate(-90 60 60)"
                  >
                    <title>{`${k}: ${klas[k]} ${unit}`}</title>
                  </circle>
                ) : null;
              offset += len;
              return el;
            })
          : null}
        <text className="donut-total" x="60" y="62" textAnchor="middle">
          {total}
        </text>
        <text className="donut-unit" x="60" y="80" textAnchor="middle">
          {unit}
        </text>
      </svg>
      <ul className="legend">
        {ranges.map((range, i) => (
          <li key={range.klas}>
            <span className={`sam-dot sam-k${i + 1}`} aria-hidden="true" />
            <span>
              {range.klas} <small className="muted">{range.teks}</small>
            </span>
            <b>{klas[range.klas]}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Penjelasan cara nilai dihitung, dengan angka siswa bila sudah ada. */
export function HowCalculated({ entry, settings }: { entry: SamaptaEntry; settings: Pick<SamaptaSettings, "baik_sekali" | "baik" | "cukup"> }) {
  const { score, result } = entry;
  const nilaiB = [result.pull_nilai, result.situp_nilai, result.pushup_nilai, result.shuttle_nilai];
  const ranges = klasRanges(settings);
  return (
    <ol className="sam-steps">
      <li>
        <b>Garjas A</b> = nilai lari 12 menit{score.garjasA !== null ? <> = <b>{fmt(score.garjasA)}</b></> : null}.
      </li>
      <li>
        <b>Garjas B</b> = rata-rata nilai {score.pullLabel}, sit up, push up, dan shuttle run
        {score.garjasB !== null ? (
          <>
            {" "}= ({nilaiB.map((v) => fmt(v)).join(" + ")}) ÷ 4 = <b>{fmt(score.garjasB)}</b>
          </>
        ) : null}
        .
      </li>
      <li>
        <b>Hasil akhir</b> = (Garjas A + Garjas B) ÷ 2
        {score.akhir !== null ? (
          <>
            {" "}= ({fmt(score.garjasA)} + {fmt(score.garjasB)}) ÷ 2 = <b>{fmt(score.akhir)}</b>
          </>
        ) : null}
        .
      </li>
      <li>
        <b>Klasifikasi</b>: {ranges.map((r) => `${r.klas} ${r.teks}`).join(" · ")}.
      </li>
      <li>Renang dicatat sebagai ketangkasan dan tidak masuk hitungan hasil akhir.</li>
    </ol>
  );
}

/** Chip kemajuan per pos, mis. "Lari 11/11". Tiap chip membuka isian pos itu. */
export function PosChips({
  tesId,
  progress,
  peserta,
  current,
  belum = false,
  label = "Pilih pos",
}: {
  tesId: string;
  progress: Record<Pos, number>;
  peserta: number;
  current?: Pos;
  belum?: boolean;
  label?: string;
}) {
  return (
    <nav className="sam-chips" aria-label={label}>
      {POS.map((pos) => {
        const n = progress[pos] ?? 0;
        const state = peserta > 0 && n >= peserta ? "is-done" : n > 0 ? "is-part" : "is-none";
        return (
          <Link
            key={pos}
            href={`/samapta/${tesId}?tab=pos&pos=${pos}${belum ? "&belum=1" : ""}`}
            className={`sam-chip ${state}`}
            aria-current={current === pos ? "page" : undefined}
            title={POS_INFO[pos].label}
          >
            {state === "is-done" ? <Icon name="check" className="icon sam-chip-icon" /> : null}
            <span>{POS_INFO[pos].short}</span>
            <b>
              {n}/{peserta}
            </b>
          </Link>
        );
      })}
    </nav>
  );
}

/** Tautan ke halaman cetak (dibuat terpisah); memakai <a> biasa karena halaman cetak berdiri sendiri. */
export function PrintLink({ href, children, variant = "secondary", size }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" }) {
  const classes = ["btn", variant !== "primary" ? `btn-${variant}` : "", size ? `btn-${size}` : ""].filter(Boolean).join(" ");
  return (
    <a className={classes} href={href}>
      <Icon name="print" />
      {children}
    </a>
  );
}

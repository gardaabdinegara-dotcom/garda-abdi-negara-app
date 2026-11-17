// Komponen bersama Tes Samapta (desain "mode lapangan per pos"): kotak pos, kartu hasil, rincian nilai,
// sebaran klasifikasi, dan kemajuan pos. Lebar batang memakai <meter> atau atribut SVG, bukan style inline (CSP).
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
  deltaText,
  deltaTone,
  diff,
  fmt,
  KLAS_TONE,
  klasRanges,
  materiOf,
  POS_TILE,
  renangText,
} from "@/app/(ruang)/samapta/samapta-ui";
import { SamIcon } from "./samapta-icon";
import { Badge } from "./ui";

export function SamaptaStatusBadge({ status }: { status: SamaptaStatus }) {
  return <Badge tone={status === "SELESAI" ? "success" : status === "DIBATALKAN" ? "danger" : "warning"}>{TEST_STATUS_LABEL[status]}</Badge>;
}

export function KlasBadge({ klas }: { klas: Klasifikasi | null }) {
  return klas ? <Badge tone={KLAS_TONE[klas]}>{klas}</Badge> : <Badge>Belum lengkap</Badge>;
}

/** Selisih bertanda panah, hijau naik dan merah turun. */
export function Delta({ value, suffix, digits = 2 }: { value: number | null; suffix?: string; digits?: number }) {
  if (value === null) return null;
  return (
    <span className={`sam-d is-${deltaTone(value)}`}>
      {deltaText(value, digits)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}

/** Delapan kotak pos: sisa siswa per pos. Ketuk kotak untuk masuk mode lapangan pos itu. */
export function StationTiles({ tesId, progress, peserta }: { tesId: string; progress: Record<Pos, number>; peserta: number }) {
  return (
    <div className="sam-tiles">
      {POS.map((pos) => {
        const n = progress[pos] ?? 0;
        const left = Math.max(0, peserta - n);
        const done = left === 0;
        return (
          <Link
            key={pos}
            href={`/samapta/${tesId}/pos/${pos}`}
            className={`sam-tile${done ? "" : " is-part"}`}
            aria-label={`${POS_TILE[pos]}: ${n} dari ${peserta} terisi${done ? "" : `, ${left} belum`}`}
          >
            <span className="sam-tile-main">
              <b>{POS_TILE[pos]}</b>
              <span>
                {n}/{peserta}
                {done ? "" : ` · ${left} belum`}
              </span>
            </span>
            {done ? (
              <span className="sam-tile-ok">
                <SamIcon name="tick" />
              </span>
            ) : (
              <span className="sam-tile-cnt">{left}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** Batang sebaran klasifikasi (SVG) dan legenda, dengan pembanding tes sebelumnya. */
export function KlasStack({ klas, prev, prevName }: { klas: Record<Klasifikasi, number>; prev?: Record<Klasifikasi, number> | null; prevName?: string }) {
  const total = KLASIFIKASI.reduce((sum, k) => sum + klas[k], 0);
  const used = KLASIFIKASI.filter((k) => klas[k] > 0);
  const gap = used.length > 1 ? 0.8 : 0;
  let x = 0;
  return (
    <div className="sam-klas">
      <div className="sam-dist">
        <svg viewBox="0 0 100 12" preserveAspectRatio="none" role="img" aria-label={`Sebaran: ${KLASIFIKASI.map((k) => `${k} ${klas[k]}`).join(", ")}`}>
          {total > 0
            ? KLASIFIKASI.map((k, i) => {
                if (!klas[k]) return null;
                const w = (klas[k] / total) * (100 - gap * (used.length - 1));
                const rect = <rect key={k} className={`sam-k${i + 1}`} x={x} y={0} width={w} height={12} />;
                x += w + gap;
                return rect;
              })
            : null}
        </svg>
      </div>
      <dl className="sam-lgd">
        {KLASIFIKASI.map((k, i) => (
          <div key={k}>
            <dt>
              <i className={`sam-sw sam-k${i + 1}`} aria-hidden="true" />
              {k}
            </dt>
            <dd>
              <b>{klas[k]}</b>
              {prev ? (
                <em>
                  {prevName}: {prev[k]}
                </em>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Kemajuan tiap pos (batang <meter>); ketuk untuk membuka mode lapangan pos itu. */
export function PosBars({ tesId, progress, peserta, query = "" }: { tesId: string; progress: Record<Pos, number>; peserta: number; query?: string }) {
  return (
    <div className="sam-posbars">
      {POS.map((pos) => {
        const n = progress[pos] ?? 0;
        const part = n < peserta;
        return (
          <Link key={pos} href={`/samapta/${tesId}/pos/${pos}${query}`} className="sam-posbar">
            <span>
              <b>{POS_INFO[pos].short}</b>
              <em>
                {n}/{peserta}
              </em>
            </span>
            <meter className={`sam-meter${part ? " is-part" : ""}`} min={0} max={Math.max(peserta, 1)} value={n} aria-label={`${POS_TILE[pos]} ${n} dari ${peserta}`} />
          </Link>
        );
      })}
    </div>
  );
}

/** Kartu hasil utama: hasil akhir besar, klasifikasi, selisih dari tes sebelumnya, Garjas A dan B. */
export function ResultHero({
  entry,
  label,
  peserta,
  prev,
}: {
  entry: SamaptaEntry;
  label: string;
  peserta: number;
  prev: { entry: SamaptaEntry; name: string; month: string } | null;
}) {
  const { score } = entry;
  const d = diff(prev?.entry.score.akhir, score.akhir);
  return (
    <section className="sam-rhero" aria-label="Hasil akhir">
      <div className="sam-rhero-top">
        <span>{label}</span>
        {score.klas ? <span className="sam-hpill">{score.klas}</span> : <span className="sam-hpill">Belum lengkap</span>}
      </div>
      <div className="sam-rhero-main">
        <b className="sam-rhero-big">{fmt(score.akhir)}</b>
        {d !== null && prev ? (
          <span className="sam-rhero-d">
            {deltaText(d)} dari {prev.name}
          </span>
        ) : null}
      </div>
      <p className="sam-rhero-rank">
        {score.akhir === null
          ? "Hasil akhir muncul setelah semua materi Garjas A dan B terisi."
          : entry.rank && prev
            ? `Peringkat ${entry.rank} dari ${peserta} peserta`
            : ""}
      </p>
      <div className="sam-rhero-ab">
        <div>
          <b>{fmt(score.garjasA)}</b>
          <span>Garjas A</span>
        </div>
        <div>
          <b>{fmt(score.garjasB)}</b>
          <span>Garjas B</span>
        </div>
        {prev ? (
          <div>
            <b>{fmt(prev.entry.score.akhir)}</b>
            <span>
              {prev.name}
              {prev.month ? ` (${prev.month})` : ""}
            </span>
          </div>
        ) : (
          <div>
            <b>
              {entry.rank ?? "-"}
              {entry.rank ? <small> / {peserta}</small> : null}
            </b>
            <span>Peringkat</span>
          </div>
        )}
      </div>
    </section>
  );
}

const MATERI_POS = { lari: "lari", pull: "pull", situp: "situp", pushup: "pushup", shuttle: "shuttle" } as const;
const MATERI_LABEL: Record<string, string> = { lari: "Lari 12 menit", shuttle: "Shuttle run" };

/**
 * Rincian nilai per materi dibanding tes sebelumnya. Dengan `edit`, tiap baris punya tautan "Ubah"
 * ke mode lapangan pos itu, dan tensi serta badan tampil sebagai dua baris.
 */
export function RincianList({ entry, prev, prevName, edit }: { entry: SamaptaEntry; prev: SamaptaEntry | null; prevName: string; edit?: (pos: Pos) => string }) {
  const { result, score } = entry;
  const cur = materiOf(result, score.pullLabel);
  const old = prev ? materiOf(prev.result, score.pullLabel) : null;
  const renang = renangText(result);
  const tensi = result.tensi.filter((t) => t !== "");
  const riwayat = result.riwayat.filter((r) => r.trim() !== "");
  const badan = [
    result.tinggi_cm !== null ? `${fmt(result.tinggi_cm, 1)} cm` : "",
    result.berat_kg !== null ? `${fmt(result.berat_kg, 1)} kg` : "",
  ].filter(Boolean);
  const imt = score.imt !== null ? `IMT ${fmt(score.imt, 1)} ${score.imtKlas}` : "";
  const editLink = (pos: Pos, what: string) =>
    edit ? (
      <Link className="sam-ubah" href={edit(pos)} aria-label={`Ubah ${what}`}>
        <SamIcon name="edit" />
      </Link>
    ) : null;

  return (
    <ul className="sam-rinc">
      {cur.map((m, i) => {
        const before = old?.[i];
        const d = diff(before?.nilai, m.nilai);
        const label = MATERI_LABEL[m.key] ?? (m.key === "pull" ? m.short : m.label);
        return (
          <li key={m.key}>
            <div className="sam-rinc-main">
              <b>{label}</b>
              <span>
                {m.hasil === "-" ? "Belum diisi" : m.hasil.replace(" detik", " dtk")}
                {before && before.hasil !== "-" ? ` · ${prevName} ${before.hasil.replace(" detik", "").replace(" kali", "")}` : ""}
              </span>
            </div>
            {d !== null ? <Delta value={d} digits={2} /> : null}
            <span className={`sam-nl${m.nilai === null ? " is-empty" : ""}`}>{fmt(m.nilai)}</span>
            {editLink(MATERI_POS[m.key], label)}
          </li>
        );
      })}
      <li>
        <div className="sam-rinc-main">
          <b>Renang 50 m</b>
          <span>{renang ?? "Belum diisi"}</span>
        </div>
        <span className="sam-nl is-empty" title="Renang tidak masuk nilai akhir">
          -
        </span>
        {editLink("renang", "renang")}
      </li>
      {edit ? (
        <>
          <li>
            <div className="sam-rinc-main">
              <b>Tensi</b>
              <span>
                {tensi.length ? result.tensi.map((t) => t || "-").join(" · ") : "Belum diisi"}
                {tensi.length ? ` · riwayat: ${riwayat.length ? riwayat.join("; ") : "tidak ada"}` : ""}
              </span>
            </div>
            {editLink("tensi", "tensi")}
          </li>
          <li>
            <div className="sam-rinc-main">
              <b>Tinggi & berat</b>
              <span>{badan.length ? [badan.join(", "), imt].filter(Boolean).join(" · ") : "Belum diisi"}</span>
            </div>
            {editLink("badan", "tinggi dan berat")}
          </li>
        </>
      ) : (
        <li>
          <div className="sam-rinc-main">
            <b>Tensi & badan</b>
            <span>{[tensi[0] ?? "", badan.join(", "), imt].filter(Boolean).join(" · ") || "Belum diisi"}</span>
          </div>
        </li>
      )}
    </ul>
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

/** Data badan dan tensi dalam bentuk daftar pendek. */
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
        <dd>{score.imt !== null ? `${fmt(score.imt, 1)} · ${score.imtKlas}` : "-"}</dd>
      </div>
      <div>
        <dt>Tensi I · II · III</dt>
        <dd>{result.tensi.map((t) => t || "-").join(" · ")}</dd>
      </div>
      <div>
        <dt>Riwayat kesehatan</dt>
        <dd>{riwayat.length ? riwayat.join("; ") : tensiDone ? "Tidak ada" : "-"}</dd>
      </div>
    </dl>
  );
}

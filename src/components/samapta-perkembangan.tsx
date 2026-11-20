// Grafik perkembangan Samapta satu siswa: garis hasil akhir dari tes ke tes terhadap batas Baik dan Baik Sekali,
// dan tren tiap materi (grafik kecil + ▲/▼ dibanding tes sebelumnya). Digambar di server dengan atribut SVG (CSP).
import { deltaText, deltaTone, fmt, shortDate, shortTestName } from "@/app/(ruang)/samapta/samapta-ui";
import type { SamaptaSettings } from "@/lib/core/samapta";
import { grafikAkhir, SATUAN_MATERI, seriAkhir, seriMateri, titikSparkline, UKURAN_GRAFIK, type RiwayatSamapta } from "@/lib/core/samapta-perkembangan";

type Batas = Pick<SamaptaSettings, "baik" | "baik_sekali">;

const bulat = (v: number) => Math.round(v * 100) / 100;

function posisiBatas(akhir: number, batas: Batas): string {
  if (akhir >= batas.baik_sekali) return "di atas batas Baik Sekali";
  if (akhir >= batas.baik) return "di atas batas Baik";
  return "di bawah batas Baik";
}

/** Grafik garis hasil akhir semua tes yang diikuti (yang hasil akhirnya lengkap). */
export function GrafikPerkembangan({ riwayat, settings }: { riwayat: readonly RiwayatSamapta[]; settings: Batas }) {
  const titik = seriAkhir(riwayat);
  if (!titik.length) {
    return (
      <section className="card sam-card sam-pk">
        <h2>Hasil akhir</h2>
        <p className="sam-sub">Grafik muncul setelah ada tes dengan hasil akhir lengkap (Garjas A dan B).</p>
      </section>
    );
  }
  const u = UKURAN_GRAFIK;
  const g = grafikAkhir(titik, settings, u);
  const first = g.titik[0]!;
  const last = g.titik.at(-1)!;
  const sejak = g.titik.length > 1 ? bulat(last.akhir - first.akhir) : null;
  const banyak = g.titik.length > 5;
  const balonAtas = last.y - 35 >= 0;
  const balonY = balonAtas ? last.y - 34.6 : last.y + 12;
  const balonX = Math.min(Math.max(last.x - 31, 2), u.lebar - 64);
  // Label garis batas di antara dua titik pertama agar tidak tertimpa titik; satu titik: di kiri.
  const batasX = g.titik.length > 1 ? (g.titik[0]!.x + g.titik[1]!.x) / 2 : u.kiri + 6;
  const batasAnchor = g.titik.length > 1 ? "middle" : "start";
  const label = `Grafik hasil akhir: ${titik.map((t) => `${shortTestName(t.nama)} ${fmt(t.akhir)}`).join(", ")}. Batas Baik ${fmt(settings.baik)}, Baik Sekali ${fmt(settings.baik_sekali)}.`;

  return (
    <section className="card sam-card sam-pk" aria-labelledby="sam-pk-h">
      <div className="sam-card-head">
        <div>
          <h2 id="sam-pk-h">Hasil akhir</h2>
          <p>
            {shortTestName(last.nama)} {posisiBatas(last.akhir, settings)}
          </p>
        </div>
        {sejak !== null ? (
          <span className={`sam-pk-pill is-${deltaTone(sejak)}`}>
            {deltaText(sejak)} sejak {shortTestName(first.nama)}
          </span>
        ) : null}
      </div>
      <svg className="sam-chart" viewBox={`0 0 ${u.lebar} ${u.tinggi}`} role="img" aria-label={label}>
        {g.ticks.map((t) => (
          <g key={t.nilai}>
            <line className="sam-ch-gl" x1={u.kiri} y1={t.y} x2={u.kanan} y2={t.y} />
            <text className="sam-ch-ax" x={u.kiri - 8} y={t.y + 3.5} textAnchor="end">
              {t.nilai}
            </text>
          </g>
        ))}
        <path className="sam-ch-ar" d={g.bidang} />
        <line className="sam-ch-t is-bs" x1={u.kiri} y1={g.baikSekali} x2={u.kanan} y2={g.baikSekali} />
        <text className="sam-ch-tl is-bs" x={batasX} y={g.baikSekali - 5} textAnchor={batasAnchor}>
          Baik Sekali · {fmt(settings.baik_sekali)}
        </text>
        <line className="sam-ch-t" x1={u.kiri} y1={g.baik} x2={u.kanan} y2={g.baik} />
        <text className="sam-ch-tl" x={batasX} y={g.baik - 5} textAnchor={batasAnchor}>
          Baik · {fmt(settings.baik)}
        </text>
        {g.titik.length > 1 ? <path className="sam-ch-ln" d={g.garis} /> : null}
        {g.titik.map((p, i) =>
          i === g.titik.length - 1 ? null : (
            <g key={p.tes_id}>
              <circle className="sam-ch-p" cx={p.x} cy={p.y} r="4.5" />
              {!banyak ? (
                <text className="sam-ch-v" x={p.x} y={p.y - 10} textAnchor="middle">
                  {fmt(p.akhir)}
                </text>
              ) : null}
            </g>
          ),
        )}
        <circle className="sam-ch-halo" cx={last.x} cy={last.y} r="11" />
        <circle className="sam-ch-p is-last" cx={last.x} cy={last.y} r="5.5" />
        <rect className="sam-ch-bb" x={balonX} y={balonY} width="62" height="21" rx="7" />
        <path
          className="sam-ch-bb"
          d={balonAtas ? `M${last.x - 5} ${balonY + 20.5} L${last.x} ${balonY + 26} L${last.x + 5} ${balonY + 20.5} Z` : `M${last.x - 5} ${balonY + 0.5} L${last.x} ${balonY - 5} L${last.x + 5} ${balonY + 0.5} Z`}
        />
        <text className="sam-ch-bt" x={balonX + 31} y={balonY + 14.5} textAnchor="middle">
          {fmt(last.akhir)}
        </text>
        {g.titik.map((p) =>
          p.label ? (
            <g key={`x-${p.tes_id}`}>
              <text className="sam-ch-x" x={p.x} y={u.bawah + 19} textAnchor="middle">
                {shortTestName(p.nama)}
              </text>
              <text className="sam-ch-x2" x={p.x} y={u.bawah + 32} textAnchor="middle">
                {shortDate(p.tanggal)}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      {g.titik.length === 1 ? <p className="sam-sub">Garis perkembangan muncul setelah tes berikutnya.</p> : null}
    </section>
  );
}

function teksMentah(key: keyof typeof SATUAN_MATERI, mentah: number | null): string {
  if (mentah === null) return "Hasil ukur belum diisi";
  if (key === "lari") return `${fmt(mentah, 0)} m`;
  if (key === "shuttle") return `${fmt(mentah)} detik`;
  return `${fmt(mentah, 0)} kali`;
}

/** Tren lima materi bernilai: hasil ukur terakhir, grafik kecil, selisih dari tes sebelumnya, dan nilai terakhir. */
export function MateriPerkembangan({ riwayat }: { riwayat: readonly RiwayatSamapta[] }) {
  const materi = seriMateri(riwayat);
  const first = riwayat[0];
  const last = riwayat.at(-1);
  const rentang = first && last && first !== last ? `${shortTestName(first.test.nama)} sampai ${shortTestName(last.test.nama)}` : last ? shortTestName(last.test.nama) : "";
  return (
    <section className="card sam-card sam-pk" aria-labelledby="sam-pm-h">
      <div className="sam-card-head">
        <h2 id="sam-pm-h">Per materi</h2>
        <span className="sam-sub">{rentang}</span>
      </div>
      <ul className="sam-mr">
        {materi.map((m) => {
          const sp = titikSparkline(m.nilai);
          const tone = deltaTone(m.delta);
          return (
            <li key={m.key}>
              <div className="sam-mr-main">
                <b>{m.label}</b>
                <span>{m.terakhir ? teksMentah(m.key, m.terakhir.mentah) : "Belum diisi"}</span>
              </div>
              <svg className={`sam-sp is-${tone}`} viewBox="0 0 64 24" aria-hidden="true">
                {sp.points ? <polyline points={sp.points} /> : null}
                {sp.akhir ? <circle cx={sp.akhir.x} cy={sp.akhir.y} r="2.6" /> : null}
              </svg>
              <span className={`sam-d is-${tone}`} aria-label={m.delta === null ? "Belum ada pembanding" : `${m.delta > 0 ? "Naik" : m.delta < 0 ? "Turun" : "Sama"} ${fmt(Math.abs(m.delta))} dari tes sebelumnya`}>
                {m.delta === null ? "" : deltaText(m.delta)}
              </span>
              <span className={`sam-nl${m.terakhir ? "" : " is-empty"}`}>{fmt(m.terakhir?.nilai ?? null)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

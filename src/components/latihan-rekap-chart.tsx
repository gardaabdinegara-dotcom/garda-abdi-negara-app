"use client";

import { useEffect, useRef, useState } from "react";

export interface TitikRekap {
  id: string;
  label: string;
  sumbu: string;
  rincian: string;
  nilai: number | null;
}

const TINGGI = 211;
const ATAS = 12;
const BAWAH = 182;

export function GrafikRekap({ titik, mode, label }: { titik: TitikRekap[]; mode: "aktivitas" | "skor"; label: string }) {
  const plot = useRef<HTMLDivElement>(null);
  const [lebar, setLebar] = useState(340);
  const [pilihan, pilih] = useState<string | null>(null);
  const [sorotan, sorot] = useState<string | null>(null);

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setLebar(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const jumlah = titik.length;
  const terakhir = titik.findLast((t) => t.nilai !== null && (mode === "skor" || t.nilai > 0)) ?? titik.at(-1);
  const terpilih = titik.find((t) => t.id === pilihan) ?? terakhir;
  const aktif = titik.findIndex((t) => t.id === (sorotan ?? terpilih?.id));
  const detail = titik[aktif];
  const langkah = mode === "skor" ? 25 : Math.max(1, Math.ceil(Math.max(...titik.map((t) => t.nilai ?? 0)) / 4));
  const maksimum = langkah * 4;
  const kiri = Math.max(34, 12 + String(maksimum).length * 7);
  const kanan = lebar - 6;
  const slot = (kanan - kiri) / jumlah;
  const x = (i: number) => kiri + (i + 0.5) * slot;
  const y = (nilai: number) => BAWAH - (BAWAH - ATAS) * nilai / maksimum;
  const jarakLabel = Math.ceil(49 / slot);
  const lebarBatang = Math.min(slot * 0.69, 66);
  const garis = mode === "skor" ? titik.map((t, i) => {
    if (t.nilai === null) return "";
    const lanjut = i > 0 && titik[i - 1]!.nilai !== null;
    return `${lanjut ? "L" : "M"}${x(i)} ${y(t.nilai)}`;
  }).join(" ") : "";

  return (
    <figure className="lp-monitor-figure">
      <div ref={plot} className="lp-monitor-plot">
        <svg className="lp-monitor-svg" viewBox={`0 0 ${lebar} ${TINGGI}`} height={TINGGI} role="group" aria-label={label}>
          {aktif >= 0 ? (
            <rect className="lp-monitor-band" x={x(aktif) - slot / 2} y={ATAS - 4} width={slot} height={BAWAH - ATAS + 8} rx={6} aria-hidden="true" />
          ) : null}
          <g aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <g key={i}>
                <line className="lp-monitor-gridline" x1={kiri} x2={kanan} y1={y(i * langkah)} y2={y(i * langkah)} />
                <text className="lp-monitor-axis" x={kiri - 8} y={y(i * langkah)} textAnchor="end" dominantBaseline="middle">{i * langkah}</text>
              </g>
            ))}
            {titik.map((t, i) => {
              const akhir = i === jumlah - 1;
              if (!akhir && (i % jarakLabel !== 0 || jumlah - 1 - i < jarakLabel)) return null;
              const tepi = slot < 49 && jumlah > 1;
              return <text key={t.id} className="lp-monitor-axis" x={tepi && akhir ? kanan : tepi && i === 0 ? kiri : x(i)} y={BAWAH + 21}
                textAnchor={tepi && akhir ? "end" : tepi && i === 0 ? "start" : "middle"}>{t.sumbu}</text>;
            })}
          </g>
          {garis ? <path className="lp-monitor-line" d={garis} aria-hidden="true" /> : null}
          {titik.map((t, i) => (
            <g
              key={t.id}
              className="lp-monitor-point"
              data-highlighted={i === aktif}
              tabIndex={0}
              role="button"
              aria-pressed={t.id === terpilih?.id}
              aria-label={`${t.label}, ${t.rincian}`}
              onPointerEnter={(event) => { if (event.pointerType === "mouse") sorot(t.id); }}
              onPointerLeave={() => sorot(null)}
              onFocus={() => { sorot(null); pilih(t.id); }}
              onClick={() => pilih(t.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  pilih(t.id);
                }
              }}
            >
              <rect className="lp-monitor-hit" x={x(i) - slot / 2 + 1} y={ATAS - 4} width={slot - 2} height={BAWAH - ATAS + 8} rx={5} />
              {t.nilai !== null && mode === "aktivitas" ? (
                <rect className={t.nilai === 0 ? "lp-monitor-bar is-zero" : "lp-monitor-bar"} x={x(i) - lebarBatang / 2}
                  y={t.nilai === 0 ? BAWAH - 2 : y(t.nilai)} width={lebarBatang} height={t.nilai === 0 ? 2 : BAWAH - y(t.nilai)} rx={4} />
              ) : null}
              {t.nilai !== null && mode === "skor" ? <circle className="lp-monitor-dot" cx={x(i)} cy={y(t.nilai)} r={i === aktif ? 5 : 3.5} /> : null}
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="lp-monitor-reading" aria-live="polite" aria-atomic="true">
        <span>{detail?.label}</span>
        <b>{detail?.rincian}</b>
      </figcaption>
    </figure>
  );
}

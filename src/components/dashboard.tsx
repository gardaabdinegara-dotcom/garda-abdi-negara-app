// Komponen Beranda bergaya "Profesional modern": kartu sambutan bergradasi, kartu angka berikon, dan grafik SVG.
// Grafik memakai atribut SVG (bukan style inline) karena CSP aplikasi melarang style inline.
import Link from "next/link";
import type { TrendPoint } from "@/lib/core/akademik";
import { DISCIPLINE } from "@/lib/core/akademik";
import { Icon, type IconName } from "./icon";

export type Tone = "green" | "gold" | "violet" | "red" | "blue";

export interface HeroChip {
  icon: IconName;
  label: string;
  href: string;
}

/** Rupiah ringkas untuk kartu: Rp20,4 jt. */
export function rpShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `${sign}Rp${abs.toLocaleString("id-ID")}`;
}

/** "2026-11-04" → "Rab 4". */
export function dayLabel(tanggal: string): string {
  const [y, m, d] = tanggal.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)));
  return `${weekday.replace(".", "")} ${d}`;
}

export function Hero({ eyebrow, title, text, chips = [], action }: { eyebrow: string; title: string; text: string; chips?: HeroChip[]; action?: { href: string; label: string } }) {
  return (
    <section className="hero-card" aria-label="Ringkasan hari ini">
      <img className="hero-watermark" src="/brand/garda-logo-192-v1.webp" alt="" width={260} height={260} />
      <small>{eyebrow}</small>
      <h1>{title}</h1>
      <p>{text}</p>
      {chips.length ? (
        <div className="hero-chips">
          {chips.map((chip) => (
            <Link key={chip.label} href={chip.href} className="hero-chip">
              <Icon name={chip.icon} />
              {chip.label}
            </Link>
          ))}
        </div>
      ) : null}
      {action ? (
        <Link href={action.href} className="hero-action">
          {action.label}
          <Icon name="arrow" />
        </Link>
      ) : null}
    </section>
  );
}

/** Cincin persentase, mis. kapasitas siswa. */
export function RingCard({ title, sub, value, max, display, caption }: { title: string; sub: string; value: number; max: number; display: string; caption: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const filled = max > 0 ? Math.min(1, Math.max(0, value / max)) * c : 0;
  return (
    <section className="card ring-card">
      <div>
        <h2>{title}</h2>
        <p className="muted small">{sub}</p>
      </div>
      <div className="ring-body">
        <svg className="ring" viewBox="0 0 120 120" width="112" height="112" role="img" aria-label={`${title}: ${display}`}>
          <circle className="ring-track" cx="60" cy="60" r={r} fill="none" strokeWidth="13" />
          <circle className="ring-fill" cx="60" cy="60" r={r} fill="none" strokeWidth="13" strokeLinecap="round" strokeDasharray={`${filled} ${c}`} transform="rotate(-90 60 60)" />
        </svg>
        <div>
          <b className="ring-value">{display}</b>
          <span className="muted small">{caption}</span>
        </div>
      </div>
    </section>
  );
}

export function Kpi({ icon, tone, value, unit, label, href }: { icon: IconName; tone: Tone; value: string; unit?: string; label: string; href?: string }) {
  const body = (
    <>
      <span className={`tone-box tone-${tone}`}>
        <Icon name={icon} />
      </span>
      <span className="kpi-text">
        <b>
          {value}
          {unit ? <small> {unit}</small> : null}
        </b>
        <span>{label}</span>
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="card kpi">
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  );
}

/** Grafik batang kehadiran per tanggal. Batang di bawah batas "Disiplin" diberi warna emas. */
export function AttendanceChart({ title, sub, points }: { title: string; sub: string; points: TrendPoint[] }) {
  const width = 340;
  const height = 176;
  const top = 22;
  const base = 146;
  const gap = 10;
  const n = Math.max(points.length, 1);
  const barW = Math.min(30, (width - gap * (n + 1)) / n);
  const span = barW + gap;
  const startX = (width - (n * barW + (n - 1) * gap)) / 2;
  const summary = points.map((p) => `${dayLabel(p.tanggal)} ${Math.round(p.persen)}%`).join(", ");
  return (
    <section className="card chart-card">
      <div>
        <h2>{title}</h2>
        <p className="muted small">{sub}</p>
      </div>
      {points.length === 0 ? (
        <p className="muted">Belum ada sesi selesai untuk ditampilkan.</p>
      ) : (
        <>
          <svg className="bar-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${summary}`}>
            <line className="chart-base" x1="0" x2={width} y1={base} y2={base} />
            {points.map((p, i) => {
              const h = Math.max(4, ((base - top) * p.persen) / 100);
              const x = startX + i * span;
              const low = p.persen < DISCIPLINE.baik;
              return (
                <g key={p.tanggal}>
                  <rect className={low ? "bar bar-low" : "bar"} x={x} y={base - h} width={barW} height={h} rx="6" />
                  <text className="bar-value" x={x + barW / 2} y={base - h - 6} textAnchor="middle">
                    {Math.round(p.persen)}
                  </text>
                  <text className="bar-label" x={x + barW / 2} y={height - 10} textAnchor="middle">
                    {dayLabel(p.tanggal)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="chart-legend">
            <span className="dot dot-1" aria-hidden="true" />
            {DISCIPLINE.baik}% atau lebih
            <span className="dot dot-2" aria-hidden="true" />
            Di bawah {DISCIPLINE.baik}%
          </p>
        </>
      )}
    </section>
  );
}

export interface Segment {
  label: string;
  value: number;
}

/** Diagram donat komposisi, mis. siswa per jalur. */
export function DonutCard({ title, sub, segments, unit }: { title: string; sub: string; segments: Segment[]; unit: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <section className="card donut-card">
      <div>
        <h2>{title}</h2>
        <p className="muted small">{sub}</p>
      </div>
      <div className="donut-body">
        <svg className="donut" viewBox="0 0 120 120" width="128" height="128" role="img" aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
          <circle className="ring-track" cx="60" cy="60" r={r} fill="none" strokeWidth="16" />
          {total > 0
            ? segments.map((s, i) => {
                const len = (s.value / total) * c;
                const el = (
                  <circle key={s.label} className={`seg seg-${i + 1}`} cx="60" cy="60" r={r} fill="none" strokeWidth="16" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
                );
                offset += len;
                return el;
              })
            : null}
          <text className="donut-total" x="60" y="60" textAnchor="middle">
            {total}
          </text>
          <text className="donut-unit" x="60" y="78" textAnchor="middle">
            {unit}
          </text>
        </svg>
        <ul className="legend">
          {segments.map((s, i) => (
            <li key={s.label}>
              <span className={`dot dot-${i + 1}`} aria-hidden="true" />
              {s.label}
              <b>{s.value}</b>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export interface ListItem {
  key: string;
  icon: IconName;
  tone: Tone;
  title: string;
  sub: string;
  href?: string;
  side?: React.ReactNode;
}

export function ListCard({ title, sub, items, empty, action }: { title: string; sub?: string; items: ListItem[]; empty: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <section className="card list-card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub ? <p>{sub}</p> : null}
        </div>
        {action ? (
          <Link href={action.href} className="btn btn-secondary btn-sm">
            {action.label}
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="dash-list">
          {items.map((item) => {
            const inner = (
              <>
                <span className={`tone-box small tone-${item.tone}`}>
                  <Icon name={item.icon} />
                </span>
                <span className="dash-list-text">
                  <b>{item.title}</b>
                  <small>{item.sub}</small>
                </span>
                {item.side ?? null}
              </>
            );
            return <li key={item.key}>{item.href ? <Link href={item.href}>{inner}</Link> : <div>{inner}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

export function Shortcuts({ items }: { items: { href: string; icon: IconName; tone: Tone; title: string; sub: string }[] }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Pintasan</h2>
      </div>
      <div className="shortcut-grid">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="shortcut">
            <span className={`tone-box small tone-${item.tone}`}>
              <Icon name={item.icon} />
            </span>
            <span>
              <b>{item.title}</b>
              <small>{item.sub}</small>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

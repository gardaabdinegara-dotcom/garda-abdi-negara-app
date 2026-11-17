import type { Metadata } from "next";
import Link from "next/link";
import { KeuanganHead, KIND_LABEL, ReportTables, rp } from "@/components/keuangan";
import { KgIcon, type KgIconName } from "@/components/keuangan-ikon";
import { Badge } from "@/components/ui";
import { endOfMonth, text } from "@/lib/keuangan/domain";
import { bulanLabel, riwayatDompet, shiftMonth, tanggalPendek, validMonth } from "@/lib/keuangan/dompet";
import { PDF_REPORT_TITLES, validReportRange, type PdfReportKind } from "@/lib/keuangan/report-document";
import { financialStatements } from "@/lib/keuangan/reporting";
import { loadFinance, reportModel, reportRequest } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Laporan keuangan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const MAIN: { kind: PdfReportKind; icon: KgIconName; title: string }[] = [
  { kind: "cash", icon: "book", title: "Buku kas" },
  { kind: "profit", icon: "chart", title: "Laba rugi" },
  { kind: "balance", icon: "scale", title: "Neraca" },
];
const ADVANCED: { kind: PdfReportKind; icon: KgIconName; title: string; sub: string }[] = [
  { kind: "assets", icon: "file", title: "Aset & penyusutan", sub: "Daftar aset dan nilai bukunya" },
  { kind: "tax", icon: "file", title: "Omzet & pajak", sub: "Rekap omzet bulanan dan pajaknya" },
  { kind: "checks", icon: "ok", title: "Pemeriksaan", sub: "Cek kecocokan antar laporan" },
];
const KINDS = Object.keys(PDF_REPORT_TITLES) as PdfReportKind[];
const pick = (params: Record<string, string | string[] | undefined>, key: string) => (typeof params[key] === "string" ? (params[key] as string) : "");

/** Laporan satu halaman: pilih bulan, lihat untung/rugi, unduh tiga laporan utama. Laporan lain di "Laporan lanjutan". */
export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  const params = await searchParams;

  // Periode: bulan (bawaan bulan berjalan) atau rentang khusus dari/sampai.
  const dari = pick(params, "dari");
  const sampai = pick(params, "sampai");
  const custom = !validMonth(params.bulan) && validReportRange(dari, sampai) && !(dari === `${data.month}-01` && sampai === data.today);
  const month = validMonth(params.bulan) ?? (custom ? dari.slice(0, 7) : data.month);
  const from = custom ? dari : `${month}-01`;
  const to = custom ? sampai : month === data.month ? data.today : endOfMonth(month);
  const akun = pick(params, "akun") && data.state.Akun.some((a) => a.akun_id === params.akun) ? pick(params, "akun") : "";
  const requested = (pick(params, "lihat") || pick(params, "jenis")) as PdfReportKind;
  const lihat = KINDS.includes(requested) ? requested : null;
  const advancedOpen = params.lanjutan === "1" || (lihat !== null && ADVANCED.some((a) => a.kind === lihat));

  const period: Record<string, string> = custom ? { dari: from, sampai: to } : month === data.month ? {} : { bulan: month };
  const pageHref = (extra: Record<string, string> = {}, hash = "") => {
    const q = new URLSearchParams({ ...period, ...(akun ? { akun } : {}), ...extra }).toString();
    return `/keuangan/laporan${q ? `?${q}` : ""}${hash}`;
  };
  const fileQuery = (kind: PdfReportKind) => new URLSearchParams({ jenis: kind, dari: from, sampai: to, ...(kind === "cash" && akun ? { akun } : {}) }).toString();
  const pdf = (kind: PdfReportKind) => `/keuangan/laporan/pdf?${fileQuery(kind)}`;
  const csv = (kind: PdfReportKind) => `/keuangan/laporan/csv?${fileQuery(kind)}`;

  const statements = financialStatements(data.state, from, to);
  const income = -(statements.period.PENDAPATAN + statements.period.PENDAPATAN_LAIN);
  const costs = income - statements.netProfit;
  const loss = statements.netProfit < 0;
  const scale = Math.max(income, costs, 1);
  // Jumlah catatan seperti di riwayat Transaksi: tanpa koreksi, pindah saldo dihitung sekali.
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && months.length < 120; m = shiftMonth(m, 1)) months.push(m);
  const lines = months
    .flatMap((m) => riwayatDompet(data.state, { month: m, akun, owner: false, labels: KIND_LABEL }))
    .filter((r) => r.date >= from && r.date <= to).length;
  const current = !custom && month === data.month;
  const periodWord = custom ? "periode ini" : current ? "bulan ini" : bulanLabel(month);
  const subs: Record<string, string> = {
    cash: `${lines} catatan${akun ? ` di ${text(data.state.Akun.find((a) => a.akun_id === akun), "nama_akun")}` : ""}, saldo per hari`,
    profit: `Untung atau rugi ${periodWord}`,
    balance: `Harta dan modal per ${tanggalPendek(to, false)}`,
  };
  const year = Number(to.slice(0, 4));

  // Laporan di layar: yang dipilih, atau laba rugi sebagai pratinjau di laptop.
  const shownKind = lihat ?? "profit";
  const model = reportModel(data, reportRequest(data, actor, { jenis: shownKind, dari: from, sampai: to, akun }));

  const switcher = custom ? (
    <div className="kg-msw">
      <span className="off" aria-hidden="true">
        <KgIcon name="cal" />
      </span>
      <div>
        <b>
          {tanggalPendek(from)} s.d. {tanggalPendek(to)}
        </b>
        <small>
          Periode khusus · <Link href="/keuangan/laporan">Kembali ke bulanan</Link>
        </small>
      </div>
      <span className="off" aria-hidden="true" />
    </div>
  ) : (
    <nav className="kg-msw" aria-label="Pilih bulan laporan">
      <Link href={`/keuangan/laporan?bulan=${shiftMonth(month, -1)}`} aria-label="Bulan sebelumnya">
        <KgIcon name="left" />
      </Link>
      <div>
        <b>{bulanLabel(month)}</b>
        <small>{current ? `Bulan berjalan, sampai ${tanggalPendek(to, false)}` : `Satu bulan penuh, ${tanggalPendek(from, false)} s.d. ${tanggalPendek(to, false)}`}</small>
      </div>
      {month < data.month ? (
        <Link href={shiftMonth(month, 1) === data.month ? "/keuangan/laporan" : `/keuangan/laporan?bulan=${shiftMonth(month, 1)}`} aria-label="Bulan berikutnya">
          <KgIcon name="right" />
        </Link>
      ) : (
        <span className="off" aria-hidden="true">
          <KgIcon name="right" />
        </span>
      )}
    </nav>
  );

  const reportRow = (r: { kind: PdfReportKind; icon: KgIconName; title: string }, sub: string) => (
    <div className="kg-rep" key={r.kind}>
      <Link className="kg-rep-link" href={pageHref({ lihat: r.kind }, "#laporan-layar")} aria-current={lihat === r.kind ? "true" : undefined}>
        <span className="kg-ric">
          <KgIcon name={r.icon} />
        </span>
        <span className="kg-rep-main">
          <b>{r.title}</b>
          <span>{sub}</span>
        </span>
      </Link>
      <a className="kg-pdf" href={pdf(r.kind)} aria-label={`Unduh PDF ${r.title}`}>
        <KgIcon name="dl" size="s" />
        PDF
      </a>
    </div>
  );

  return (
    <div className="page kg-page">
      <KeuanganHead current="laporan" />
      <div className="kg-lap">
        <div className="kg-lap-col">
          {switcher}
          <section className="card kg-sum" aria-label="Ringkasan untung rugi">
            <span className="eyebrow">
              {loss ? "Rugi" : "Untung"} {periodWord}
            </span>
            <div className={`kg-big${loss ? " loss" : ""}`}>{rp(Math.abs(statements.netProfit))}</div>
            <div className="kg-cmp">
              <div className="kg-cmp-row">
                <span>
                  <i className="kg-sw" />
                  Pendapatan
                </span>
                <b>{rp(income)}</b>
              </div>
              <meter className="kg-bar" min={0} max={scale} value={Math.max(income, 0)} aria-label="Pendapatan" />
              <div className="kg-cmp-row">
                <span>
                  <i className="kg-sw out" />
                  Biaya
                </span>
                <b>{rp(costs)}</b>
              </div>
              <meter className="kg-bar out" min={0} max={scale} value={Math.max(costs, 0)} aria-label="Biaya" />
            </div>
          </section>

          <section className="card kg-reps" aria-label="Laporan utama">
            {MAIN.map((r) => reportRow(r, subs[r.kind]!))}
          </section>
          <a className="btn btn-block kg-dl3" href={`/keuangan/laporan/paket?${new URLSearchParams({ dari: from, sampai: to })}`}>
            <KgIcon name="dl" />
            Unduh 3 laporan (PDF)
          </a>

          <details className="kg-more" id="lanjutan" open={advancedOpen}>
            <summary>
              <KgIcon name="file" />
              <span className="kg-rep-main">
                <b>Laporan lanjutan</b>
                <span>Aset & penyusutan, omzet & pajak, pemeriksaan, periode lain</span>
              </span>
              <KgIcon name="right" className="kg-chev" />
            </summary>
            <div className="kg-more-body">
              <div>{ADVANCED.map((r) => reportRow(r, r.sub))}</div>
              <form method="get" action="/keuangan/laporan" className="kg-range" aria-label="Periode lain">
                {lihat ? <input type="hidden" name="lihat" value={lihat} /> : null}
                <div className="field">
                  <label htmlFor="lap-dari">Dari</label>
                  <input id="lap-dari" type="date" name="dari" defaultValue={from} />
                </div>
                <div className="field">
                  <label htmlFor="lap-sampai">Sampai</label>
                  <input id="lap-sampai" type="date" name="sampai" defaultValue={to} />
                </div>
                <div className="field">
                  <label htmlFor="lap-akun">Akun (buku kas)</label>
                  <select id="lap-akun" name="akun" defaultValue={akun}>
                    <option value="">Semua akun</option>
                    {data.state.Akun.map((a) => (
                      <option key={text(a, "akun_id")} value={text(a, "akun_id")}>
                        {text(a, "nama_akun")}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-secondary">
                  Tampilkan
                </button>
              </form>
              <div className="kg-presets">
                <Link className="kg-pdf csv" href={`/keuangan/laporan?${new URLSearchParams({ dari: `${year}-01-01`, sampai: `${year}-12-31` })}#lanjutan`}>
                  Tahun {year}
                </Link>
                <Link className="kg-pdf csv" href={`/keuangan/laporan?${new URLSearchParams({ dari: `${year - 1}-01-01`, sampai: `${year - 1}-12-31` })}#lanjutan`}>
                  Tahun {year - 1}
                </Link>
                <a className="kg-pdf" href={`/keuangan/laporan/buku?tahun=${year}`}>
                  <KgIcon name="dl" size="s" />
                  Buku laporan tahunan {year}
                </a>
              </div>
              {data.owner ? (
                <p className="kg-note">
                  Dasar laporan, pemetaan kategori, aset, saldo awal neraca, jurnal nonkas, dan pajak diatur di <Link href="/keuangan/penyesuaian">Penyesuaian laporan</Link>.
                </p>
              ) : null}
            </div>
          </details>
          <p className="kg-foot-note">
            Perlu untuk Excel? Unduh CSV: <a href={csv("cash")}>Buku kas</a> · <a href={csv("profit")}>Laba rugi</a> · <a href={csv("balance")}>Neraca</a>
            {lihat && !MAIN.some((m) => m.kind === lihat) ? (
              <>
                {" · "}
                <a href={csv(lihat)}>{PDF_REPORT_TITLES[lihat]}</a>
              </>
            ) : null}
          </p>
        </div>

        <div className="kg-lap-col kg-view-col">
          <section className={`card kg-view${lihat ? "" : " wide-only"}`} id="laporan-layar" aria-labelledby="laporan-judul">
            <div className="kg-view-head">
              <div>
                <span className="eyebrow">{model.business}</span>
                <h2 id="laporan-judul">{model.title}</h2>
                <p>{model.period}</p>
              </div>
              <div className="kg-view-acts">
                <Badge tone={model.status.includes("SIAP") ? "success" : "warning"}>{model.status}</Badge>
              </div>
            </div>
            <div className="kg-view-acts">
              <a className="kg-pdf" href={pdf(shownKind)}>
                <KgIcon name="dl" size="s" />
                PDF
              </a>
              <a className="kg-pdf csv" href={csv(shownKind)}>
                CSV
              </a>
              {lihat ? (
                <Link className="kg-pdf csv" href={pageHref()}>
                  Tutup
                </Link>
              ) : null}
            </div>
          </section>
          <div className={`kg-tables${lihat ? "" : " wide-only"}`}>
            <ReportTables model={model} />
          </div>
        </div>
      </div>
    </div>
  );
}

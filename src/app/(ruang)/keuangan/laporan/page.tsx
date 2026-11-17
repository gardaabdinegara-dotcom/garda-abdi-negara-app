import type { Metadata } from "next";
import Link from "next/link";
import { FinanceTabs, ReportTables } from "@/components/keuangan";
import { Badge, PageHead, Tabs } from "@/components/ui";
import { PDF_REPORT_TITLES, type PdfReportKind } from "@/lib/keuangan/report-document";
import { text } from "@/lib/keuangan/domain";
import { loadFinance, reportModel, reportRequest } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Laporan keuangan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  const params = await searchParams;
  const options = reportRequest(data, actor, params);
  const model = reportModel(data, options);
  const query = (extra: Record<string, string>) =>
    new URLSearchParams({ jenis: options.kind, dari: options.from, sampai: options.to, ...(options.accountId ? { akun: options.accountId } : {}), ...extra }).toString();
  const year = data.today.slice(0, 4);
  const presets = [
    { label: "Bulan ini", dari: `${data.month}-01`, sampai: data.today },
    { label: `Tahun ${year}`, dari: `${year}-01-01`, sampai: `${year}-12-31` },
    { label: `Tahun ${Number(year) - 1}`, dari: `${Number(year) - 1}-01-01`, sampai: `${Number(year) - 1}-12-31` },
  ];

  return (
    <div className="page">
      <PageHead
        eyebrow="Keuangan"
        title="Laporan"
        description="Buku kas, laba rugi, neraca, aset & penyusutan, omzet & pajak, dan pemeriksaan antar laporan. Isi yang sama dipakai untuk PDF."
        actions={
          <>
            <a className="btn btn-secondary" href={`/keuangan/laporan/csv?${query({})}`}>
              CSV
            </a>
            <a className="btn" href={`/keuangan/laporan/pdf?${query({})}`}>
              Unduh PDF
            </a>
          </>
        }
      />
      <FinanceTabs current="laporan" owner={data.owner} />
      <Tabs
        label="Jenis laporan"
        current={options.kind}
        items={(Object.keys(PDF_REPORT_TITLES) as PdfReportKind[]).map((kind) => ({
          key: kind,
          label: PDF_REPORT_TITLES[kind],
          href: `/keuangan/laporan?${new URLSearchParams({ jenis: kind, dari: options.from, sampai: options.to })}`,
        }))}
      />
      <section className="card">
        <form method="get" className="filters report-filters" aria-label="Periode laporan">
          <input type="hidden" name="jenis" value={options.kind} />
          <div className="field">
            <label htmlFor="dari">Dari</label>
            <input id="dari" type="date" name="dari" defaultValue={options.from} />
          </div>
          <div className="field">
            <label htmlFor="sampai">Sampai</label>
            <input id="sampai" type="date" name="sampai" defaultValue={options.to} />
          </div>
          {options.kind === "cash" ? (
            <div className="field">
              <label htmlFor="akun">Akun</label>
              <select id="akun" name="akun" defaultValue={options.accountId}>
                <option value="">Semua akun</option>
                {data.state.Akun.map((a) => (
                  <option key={text(a, "akun_id")} value={text(a, "akun_id")}>
                    {text(a, "nama_akun")}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="submit" className="btn btn-secondary">
            Tampilkan
          </button>
        </form>
        <div className="row">
          {presets.map((p) => (
            <Link key={p.label} className="tab" href={`/keuangan/laporan?${new URLSearchParams({ jenis: options.kind, dari: p.dari, sampai: p.sampai })}`}>
              {p.label}
            </Link>
          ))}
          <a className="btn btn-ghost btn-sm" href={`/keuangan/laporan/buku?tahun=${options.from.slice(0, 4)}`}>
            Buku laporan tahunan {options.from.slice(0, 4)} (PDF)
          </a>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div>
            <span className="eyebrow">{model.business}</span>
            <h2>{model.title}</h2>
            <p>
              {model.period} · {model.basis}
            </p>
          </div>
          <Badge tone={model.status.includes("SIAP") ? "success" : "warning"}>{model.status}</Badge>
        </div>
        {data.owner ? (
          <p className="muted">
            Dasar laporan, pemetaan kategori, aset, saldo awal, jurnal nonkas, dan pajak diatur di <Link href="/keuangan/penyesuaian">Penyesuaian laporan</Link>.
          </p>
        ) : null}
      </section>
      <ReportTables model={model} />
    </div>
  );
}

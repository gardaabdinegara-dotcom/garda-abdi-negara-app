import { randomUUID } from "node:crypto";
import Link from "next/link";
import { jalankanKeuangan } from "@/app/actions/keuangan";
import type { ReportDocument } from "@/lib/keuangan/report-document";
import type { InvoiceStatus } from "@/lib/keuangan/ringkasan";
import { text, type Row } from "@/lib/keuangan/domain";
import { FITUR } from "@/lib/core/fitur";
import type { FinanceData } from "@/lib/server/keuangan";
import { ActionForm, Field } from "./form";
import { KgIcon, type KgIconName } from "./keuangan-ikon";
import { bulanLabel as monthLabel } from "@/lib/keuangan/dompet";
import { Badge } from "./ui";

export type FinancePart = "ringkasan" | "tagihan" | "transaksi" | "laporan" | "biaya" | "master" | "penyesuaian" | "lainnya";

/** Rupiah dengan pemisah ribuan; nilai negatif diberi tanda minus. */
export const rp = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : `${value < 0 ? "−" : ""}Rp${Math.abs(value).toLocaleString("id-ID")}`;

const TAB_OF: Record<FinancePart, string> = {
  ringkasan: "transaksi",
  transaksi: "transaksi",
  tagihan: "tagihan",
  laporan: "laporan",
  biaya: "lainnya",
  master: "lainnya",
  penyesuaian: "lainnya",
  lainnya: "lainnya",
};

/** Tiga tab Keuangan: Transaksi (dompet), Laporan, Lainnya. Tagihan hanya muncul bila fiturnya dinyalakan. */
export function FinanceTabs({ current }: { current: FinancePart; owner?: boolean }) {
  const tab = TAB_OF[current];
  const items = [
    { key: "transaksi", href: "/keuangan", label: "Transaksi" },
    ...(FITUR.tagihan ? [{ key: "tagihan", href: "/keuangan/tagihan", label: "Tagihan" }] : []),
    { key: "laporan", href: "/keuangan/laporan", label: "Laporan" },
    { key: "lainnya", href: "/keuangan/lainnya", label: "Lainnya" },
  ];
  return (
    <nav className="kg-tabs" aria-label="Bagian keuangan">
      {items.map((item) => (
        <Link key={item.key} href={item.href} aria-current={item.key === tab ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Kepala halaman Keuangan yang ringkas: judul, tiga tab, dan isian samping (mis. pilihan bulan). */
export function KeuanganHead({ current, aside }: { current: FinancePart; aside?: React.ReactNode }) {
  return (
    <header className="kg-head">
      <h1>Keuangan</h1>
      <FinanceTabs current={current} />
      {aside ? <div className="kg-head-aside">{aside}</div> : null}
    </header>
  );
}

/** Judul bagian di bawah tab Lainnya, dengan tautan kembali. */
export function KeuanganSubHead({ title, description, back = { href: "/keuangan/lainnya", label: "Lainnya" } }: { title: string; description?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="kg-subhead">
      <Link href={back.href} className="kg-back">
        <KgIcon name="left" size="s" />
        {back.label}
      </Link>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

/** Pilihan bulan ringkas: panah sebelum/sesudah dan nama bulan. */
export function MonthSwitch({ month, prevHref, nextHref, className }: { month: string; prevHref: string; nextHref?: string; className?: string }) {
  return (
    <nav className={`kg-mon ${className ?? ""}`} aria-label="Pilih bulan">
      <Link href={prevHref} className="kg-mon-btn" aria-label="Bulan sebelumnya">
        <KgIcon name="left" size="s" />
      </Link>
      <b>{monthLabel(month)}</b>
      {nextHref ? (
        <Link href={nextHref} className="kg-mon-btn" aria-label="Bulan berikutnya">
          <KgIcon name="right" size="s" />
        </Link>
      ) : (
        <span className="kg-mon-btn off" aria-hidden="true">
          <KgIcon name="right" size="s" />
        </span>
      )}
    </nav>
  );
}

const IN_KINDS = ["PENERIMAAN_LAIN", "MODAL_MASUK", "PINJAMAN_MASUK"];

/** Menu jarang dipakai di tab Lainnya (juga kartu samping di laptop). Bagian pemilik disembunyikan dari peran lain. */
export function LainnyaDaftar({ data }: { data: FinanceData }) {
  const active = (r: Row) => r.aktif === true || r.aktif === "true" || r.aktif === "TRUE";
  const accounts = data.state.Akun.filter(active).map((a) => text(a, "nama_akun"));
  const categories = data.state.Kategori.filter(active).map((k) => text(k, "jenis_yang_diizinkan").split(","));
  const masuk = categories.filter((kinds) => kinds.some((k) => IN_KINDS.includes(k))).length;
  const keluar = categories.length - masuk;
  const closed = [...data.closed].sort();
  const items: { href: string; icon: KgIconName; title: string; sub: string; owner?: boolean; download?: boolean }[] = [
    { href: "/keuangan/master#akun", icon: "wallet", title: "Akun & saldo awal", sub: accounts.length ? accounts.join(", ") : "Belum ada akun", owner: true },
    { href: "/keuangan/master#kategori", icon: "tag", title: "Kategori", sub: `${masuk} uang masuk, ${keluar} uang keluar`, owner: true },
    {
      href: "/keuangan/master#tutup-bulan",
      icon: "lock",
      title: "Pencocokan & tutup bulan",
      sub: closed.length ? `${monthLabel(closed[closed.length - 1]!)} sudah ditutup` : "Belum ada bulan yang ditutup",
      owner: true,
    },
    { href: "/keuangan/laporan?lanjutan=1#lanjutan", icon: "file", title: "Laporan lanjutan", sub: "Aset, omzet & pajak, pemeriksaan" },
    { href: "/keuangan/penyesuaian", icon: "slider", title: "Penyesuaian laporan", sub: "Untuk pembukuan rapi, opsional", owner: true },
    ...(FITUR.tagihan
      ? [
          { href: "/keuangan/tagihan", icon: "file" as const, title: "Tagihan siswa", sub: "Cicilan dan kuitansi" },
          { href: "/keuangan/biaya", icon: "tag" as const, title: "Tarif & biaya", sub: "Tarif program dan ketentuan biaya", owner: true },
        ]
      : []),
    { href: "/keuangan/cadangan", icon: "dl", title: "Cadangan data", sub: "Unduh salinan JSON", owner: true, download: true },
  ];
  return (
    <div className="kg-sets">
      {items
        .filter((item) => !item.owner || data.owner)
        .map((item) =>
          item.download ? (
            <a key={item.href} href={item.href} className="kg-set">
              <span className="kg-set-ic">
                <KgIcon name={item.icon} size="s" />
              </span>
              <span className="kg-set-main">
                <b>{item.title}</b>
                <span>{item.sub}</span>
              </span>
              <KgIcon name="dl" size="s" className="kg-set-go" />
            </a>
          ) : (
            <Link key={item.href} href={item.href} className="kg-set">
              <span className="kg-set-ic">
                <KgIcon name={item.icon} size="s" />
              </span>
              <span className="kg-set-main">
                <b>{item.title}</b>
                <span>{item.sub}</span>
              </span>
              <KgIcon name="right" size="s" className="kg-set-go" />
            </Link>
          ),
        )}
    </div>
  );
}

const INVOICE_TONE: Record<InvoiceStatus, "success" | "warning" | "danger" | "neutral"> = {
  LUNAS: "success",
  BELUM_LUNAS: "warning",
  JATUH_TEMPO: "danger",
  BATAL: "neutral",
};
const INVOICE_LABEL: Record<InvoiceStatus, string> = { LUNAS: "Lunas", BELUM_LUNAS: "Belum lunas", JATUH_TEMPO: "Lewat jatuh tempo", BATAL: "Dibatalkan" };
export const InvoiceBadge = ({ status }: { status: InvoiceStatus }) => <Badge tone={INVOICE_TONE[status]}>{INVOICE_LABEL[status]}</Badge>;

export const KIND_LABEL: Record<string, string> = {
  PEMBAYARAN_SISWA: "Pembayaran siswa",
  PENERIMAAN_LAIN: FITUR.tagihan ? "Penerimaan lain" : "Pemasukan",
  MODAL_MASUK: "Modal masuk",
  PINJAMAN_MASUK: "Pinjaman masuk",
  BIAYA: FITUR.tagihan ? "Biaya" : "Pengeluaran",
  REFUND_SISWA: "Refund siswa",
  PRIVE: "Prive",
  POKOK_PINJAMAN_KELUAR: "Bayar pokok pinjaman",
  TRANSFER_MASUK: "Transfer masuk",
  TRANSFER_KELUAR: "Transfer keluar",
  PEMBALIK: "Pembalik (koreksi)",
};

/** Form perintah keuangan: field tersembunyi "aksi" dan ID operasi untuk mencegah simpan ganda. */
export function FinanceForm({
  aksi,
  children,
  className = "stack",
  confirm,
  resetOnSuccess,
  feedback,
}: {
  /** Kosongkan bila tombol kirim membawa name="aksi" sendiri (satu form, beberapa tindakan). */
  aksi?: string;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  feedback?: boolean;
}) {
  return (
    <ActionForm action={jalankanKeuangan} operationId={randomUUID()} className={className} confirm={confirm} resetOnSuccess={resetOnSuccess} feedback={feedback}>
      {aksi ? <input type="hidden" name="aksi" value={aksi} /> : null}
      {children}
    </ActionForm>
  );
}

export function MoneyField({ label, name, defaultValue, hint, required, className }: { label: string; name: string; defaultValue?: number | string; hint?: string; required?: boolean; className?: string }) {
  return (
    <Field
      label={label}
      name={name}
      inputMode="numeric"
      placeholder="Rp"
      defaultValue={typeof defaultValue === "number" ? defaultValue.toLocaleString("id-ID") : defaultValue}
      hint={hint}
      required={required}
      className={className}
      autoComplete="off"
    />
  );
}

export const accountOptions = (akun: Row[]) =>
  akun.filter((a) => a.aktif === true || a.aktif === "TRUE" || a.aktif === "true").map((a) => ({ value: String(a.akun_id), label: String(a.nama_akun) }));

/** Laporan keuangan dalam bentuk tabel layar; model yang sama dipakai untuk PDF. */
export function ReportTables({ model }: { model: ReportDocument }) {
  return (
    <div className="stack">
      {model.warnings.length ? (
        <div className="notice notice-warning">
          <b>Perlu diperiksa</b>
          <ul className="plain-list">
            {model.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {model.tables.map((table, ti) => (
        <section className="card" key={`${table.title}-${ti}`}>
          {table.title ? (
            <div className="card-head">
              <h2>{table.title}</h2>
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data finance-table">
              <thead>
                <tr>
                  {table.columns.map((c, ci) => (
                    <th key={`${c.label}-${ci}`} className={c.numeric ? "num" : undefined}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, ri) => (
                  <tr key={ri} className={row.style ? `row-${row.style}` : undefined}>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} className={table.columns[ci]?.numeric ? "num" : undefined}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.note ? <p className="muted">{table.note}</p> : null}
        </section>
      ))}
      {model.notes.length ? (
        <section className="card">
          <div className="card-head">
            <h2>Catatan</h2>
          </div>
          <ul className="plain-list muted">
            {model.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

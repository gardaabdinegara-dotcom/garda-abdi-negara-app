import { randomUUID } from "node:crypto";
import { jalankanKeuangan } from "@/app/actions/keuangan";
import type { ReportDocument } from "@/lib/keuangan/report-document";
import type { InvoiceStatus } from "@/lib/keuangan/ringkasan";
import type { Row } from "@/lib/keuangan/domain";
import { FITUR } from "@/lib/core/fitur";
import { ActionForm, Field } from "./form";
import { Badge, Tabs } from "./ui";

export type FinancePart = "ringkasan" | "tagihan" | "transaksi" | "laporan" | "biaya" | "master" | "penyesuaian";

/** Rupiah dengan pemisah ribuan; nilai negatif diberi tanda minus. */
export const rp = (value: number | null | undefined) =>
  value === null || value === undefined ? "-" : `${value < 0 ? "−" : ""}Rp${Math.abs(value).toLocaleString("id-ID")}`;

export function FinanceTabs({ current, owner }: { current: FinancePart; owner: boolean }) {
  const items = [
    { key: "ringkasan", href: "/keuangan", label: "Ringkasan" },
    ...(FITUR.tagihan ? [{ key: "tagihan", href: "/keuangan/tagihan", label: "Tagihan" }] : []),
    { key: "transaksi", href: "/keuangan/transaksi", label: FITUR.tagihan ? "Transaksi" : "Pemasukan & pengeluaran" },
    { key: "laporan", href: "/keuangan/laporan", label: "Laporan" },
    ...(FITUR.tagihan ? [{ key: "biaya", href: "/keuangan/biaya", label: "Tarif & biaya" }] : []),
    ...(owner
      ? [
          { key: "master", href: "/keuangan/master", label: "Akun & periode" },
          { key: "penyesuaian", href: "/keuangan/penyesuaian", label: "Penyesuaian laporan" },
        ]
      : []),
  ];
  return <Tabs items={items} current={current} label="Bagian keuangan" />;
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
                  {table.columns.map((c) => (
                    <th key={c.label} className={c.numeric ? "num" : undefined}>
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

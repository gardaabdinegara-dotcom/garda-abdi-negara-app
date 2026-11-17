import type { Metadata } from "next";
import { FITUR } from "@/lib/core/fitur";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckField, Field, SubmitButton } from "@/components/form";
import { accountOptions, FinanceForm, InvoiceBadge, KIND_LABEL, MoneyField, rp } from "@/components/keuangan";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { num, text } from "@/lib/keuangan/domain";
import { accountName, invoiceItem, paymentsOf } from "@/lib/keuangan/ringkasan";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/components/report-document";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Rincian tagihan" };

const METHODS = ["Transfer", "Tunai", "QRIS", "Lainnya"].map((m) => ({ value: m, label: m }));

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  // Tagihan siswa disembunyikan (lib/core/fitur.ts): keuangan dicatat manual lewat Transaksi.
  if (!FITUR.tagihan) notFound();
  const data = await loadFinance(actor);
  const { id } = await params;
  const invoice = data.state.Tagihan.find((i) => i.tagihan_id === decodeURIComponent(id));
  if (!invoice) notFound();
  const item = invoiceItem(data.state, invoice, data.today);
  const tagihanId = text(invoice, "tagihan_id");
  const payments = paymentsOf(data.state, tagihanId);
  const adjustments = data.state.Penyesuaian_Tagihan.filter((a) => a.tagihan_id === tagihanId);
  const reversedAdjustments = new Set(adjustments.filter((a) => a.jenis === "PEMBALIK").map((a) => text(a, "penyesuaian_rujukan_id")));
  const accounts = accountOptions(data.state.Akun);
  const receipts = payments.filter((p) => p.tx.jenis === "PEMBAYARAN_SISWA" && !p.reversed);
  const open = !item.summary.cancelled && item.summary.remaining > 0;

  return (
    <div className="page">
      <PageHead
        back={{ href: "/keuangan/tagihan", label: "Tagihan" }}
        eyebrow={text(invoice, "nomor_tagihan")}
        title={item.student.nama}
        description={`${item.student.program}${item.student.kelas ? ` · ${item.student.kelas}` : ""} · ${text(invoice, "periode_layanan") ? monthLabel(text(invoice, "periode_layanan")) : "paket"} · terbit ${formatDate(text(invoice, "tanggal_terbit"), "long")}`}
        actions={<InvoiceBadge status={item.status} />}
      />
      <div className="grid-stats">
        <section className="card stat">
          <span className="stat-label">Nilai tagihan</span>
          <span className="stat-value">{rp(item.summary.face)}</span>
          <span className="stat-sub">
            Dasar {rp(num(invoice, "nominal_dasar"))}
            {num(invoice, "diskon_awal") ? ` · diskon ${rp(num(invoice, "diskon_awal"))}` : ""}
          </span>
        </section>
        <section className="card stat">
          <span className="stat-label">Sudah dibayar</span>
          <span className="stat-value">{rp(item.summary.paid)}</span>
          <span className="stat-sub">{item.summary.credit ? `Kelebihan bayar ${rp(item.summary.credit)}` : `${receipts.length} pembayaran`}</span>
        </section>
        <section className="card stat">
          <span className="stat-label">Sisa</span>
          <span className="stat-value">{rp(item.summary.remaining)}</span>
          <span className="stat-sub">{item.summary.overdue ? `${rp(item.summary.overdue)} lewat jatuh tempo` : item.nextDue ? `Berikutnya ${formatDate(item.nextDue.date)}` : "Tidak ada sisa"}</span>
        </section>
      </div>
      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Jadwal cicilan</h2>
            </div>
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Cicilan</th>
                    <th>Jatuh tempo</th>
                    <th className="num">Nominal</th>
                    <th className="num">Sisa</th>
                  </tr>
                </thead>
                <tbody>
                  {item.summary.schedules.map((j) => (
                    <tr key={text(j, "jadwal_id")}>
                      <td data-label="Cicilan">Ke-{text(j, "urutan")}</td>
                      <td data-label="Jatuh tempo">{formatDate(text(j, "jatuh_tempo"))}</td>
                      <td data-label="Nominal" className="num">
                        {rp(j.effective)}
                        {j.effective !== num(j, "nominal") ? <span className="cell-sub">semula {rp(num(j, "nominal"))}</span> : null}
                      </td>
                      <td data-label="Sisa" className="num">
                        {j.remaining ? (
                          <span className="row">
                            <b>{rp(j.remaining)}</b>
                            {text(j, "jatuh_tempo") < data.today ? <Badge tone="danger">Lewat</Badge> : null}
                          </span>
                        ) : (
                          <Badge tone="success">Lunas</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Pembayaran & refund</h2>
            </div>
            {payments.length === 0 ? (
              <Empty title="Belum ada pembayaran" />
            ) : (
              <div className="item-list">
                {payments.map(({ tx, base, reversed }) => (
                  <div className="item" key={text(tx, "transaksi_id")}>
                    <div className="item-main">
                      <b className={tx.arah === "IN" ? "amount-in" : "amount-out"}>
                        {tx.arah === "IN" ? "+" : "−"}
                        {rp(num(tx, "nominal"))}
                      </b>
                      <span className="cell-sub">
                        {formatDate(text(tx, "tanggal_transaksi"))} · {KIND_LABEL[text(tx, "jenis")] ?? text(tx, "jenis")}
                        {tx.jenis === "PEMBALIK" ? ` atas ${KIND_LABEL[text(base, "jenis")]?.toLowerCase()}` : ""} · {accountName(data.state, tx.akun_id)}
                        {text(tx, "metode_pembayaran") ? ` · ${text(tx, "metode_pembayaran")}` : ""} · {text(tx, "deskripsi")}
                      </span>
                    </div>
                    <div className="row">
                      {reversed ? <Badge tone="neutral">Dikoreksi</Badge> : null}
                      {tx.jenis === "PEMBAYARAN_SISWA" && !reversed ? (
                        <Link className="btn btn-secondary btn-sm" href={`/keuangan/kuitansi/${text(tx, "transaksi_id")}`}>
                          Kuitansi
                        </Link>
                      ) : null}
                    </div>
                    {data.owner && !reversed && tx.jenis !== "PEMBALIK" ? (
                      <details className="details-edit item-edit">
                        <summary className="btn btn-ghost btn-sm">Koreksi (pembalik)</summary>
                        <FinanceForm aksi="transaction.reverse" className="form-grid three" confirm="Buat pembalik untuk transaksi ini?">
                          <input type="hidden" name="transaksi_id" value={text(tx, "transaksi_id")} />
                          <Field label="Tanggal koreksi" name="tanggal_transaksi" type="date" defaultValue={data.today} />
                          <Field label="Alasan" name="alasan" required />
                          <div className="form-actions">
                            <SubmitButton size="sm" variant="danger">
                              Koreksi
                            </SubmitButton>
                          </div>
                        </FinanceForm>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
          {adjustments.length ? (
            <section className="card">
              <div className="card-head">
                <h2>Penyesuaian</h2>
              </div>
              <div className="item-list">
                {adjustments.map((a) => (
                  <div className="item" key={text(a, "penyesuaian_id")}>
                    <div className="item-main">
                      <b>
                        {text(a, "jenis") === "PEMBALIK" ? "Pembalik penyesuaian" : text(a, "jenis") === "PEMBATALAN" ? "Pembatalan" : "Pengurangan"} {rp(num(a, "nominal"))}
                      </b>
                      <span className="cell-sub">
                        {formatDate(text(a, "tanggal_efektif"))} · {text(a, "alasan")}
                      </span>
                    </div>
                    {data.owner && a.jenis !== "PEMBALIK" && !reversedAdjustments.has(text(a, "penyesuaian_id")) ? (
                      <details className="details-edit item-edit">
                        <summary className="btn btn-ghost btn-sm">Batalkan penyesuaian</summary>
                        <FinanceForm aksi="invoice.adjust.reverse" className="form-grid three">
                          <input type="hidden" name="penyesuaian_id" value={text(a, "penyesuaian_id")} />
                          <Field label="Tanggal" name="tanggal_efektif" type="date" defaultValue={data.today} />
                          <Field label="Alasan" name="alasan" required />
                          <div className="form-actions">
                            <SubmitButton size="sm">Simpan</SubmitButton>
                          </div>
                        </FinanceForm>
                      </details>
                    ) : reversedAdjustments.has(text(a, "penyesuaian_id")) ? (
                      <Badge>Dibatalkan</Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className="stack">
          {data.recorder && open ? (
            <section className="card">
              <div className="card-head">
                <h2>Catat pembayaran</h2>
              </div>
              {accounts.length === 0 ? (
                <Notice>Belum ada akun kas/bank aktif.</Notice>
              ) : (
                <FinanceForm aksi="payment.create" resetOnSuccess>
                  <input type="hidden" name="tagihan_id" value={tagihanId} />
                  <div className="form-grid two">
                    <MoneyField label="Nominal" name="nominal" defaultValue={item.nextDue?.amount ?? item.summary.remaining} required hint={`Sisa ${rp(item.summary.remaining)}`} />
                    <Field label="Tanggal bayar" name="tanggal_transaksi" type="date" defaultValue={data.today} />
                    <Field label="Masuk ke akun" name="akun_id" type="select" options={accounts} />
                    <Field label="Metode" name="metode_pembayaran" type="select" options={METHODS} />
                    <Field label="Referensi" name="referensi_eksternal" placeholder="No. transfer / catatan" />
                    <Field label="Tautan bukti (opsional)" name="bukti_url" type="url" placeholder="https://…" />
                  </div>
                  <div className="form-actions">
                    <SubmitButton>Simpan pembayaran</SubmitButton>
                  </div>
                </FinanceForm>
              )}
            </section>
          ) : null}
          {data.owner && !item.summary.cancelled ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Penyesuaian tagihan</h2>
                  <p>Diskon susulan atau pembatalan. Dicatat sebagai riwayat; tagihan asal tidak diubah.</p>
                </div>
              </div>
              <FinanceForm aksi="invoice.adjust" confirm="Simpan penyesuaian tagihan ini?">
                <input type="hidden" name="tagihan_id" value={tagihanId} />
                <div className="form-grid two">
                  <MoneyField label="Nominal pengurangan" name="nominal" required />
                  <Field label="Tanggal efektif" name="tanggal_efektif" type="date" defaultValue={data.today} />
                  <Field label="Alasan" name="alasan" required className="span-all" />
                </div>
                <CheckField label="Batalkan seluruh sisa kewajiban" name="batalkan" hint="Nominal harus sama dengan nilai tagihan yang masih berlaku." />
                <div className="form-actions">
                  <SubmitButton variant="secondary">Simpan penyesuaian</SubmitButton>
                </div>
              </FinanceForm>
            </section>
          ) : null}
          {data.owner && receipts.length ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Refund</h2>
                  <p>Mengembalikan sebagian/seluruh pembayaran; boleh disertai pengurangan tagihan.</p>
                </div>
              </div>
              <FinanceForm aksi="invoice.refund" confirm="Catat refund ini?">
                <input type="hidden" name="tagihan_id" value={tagihanId} />
                <div className="form-grid two">
                  <Field
                    label="Pembayaran asal"
                    name="transaksi_rujukan_id"
                    type="select"
                    className="span-all"
                    options={receipts.map((p) => ({ value: text(p.tx, "transaksi_id"), label: `${formatDate(text(p.tx, "tanggal_transaksi"))} · ${rp(num(p.tx, "nominal"))}` }))}
                  />
                  <MoneyField label="Nominal refund" name="nominal" required />
                  <Field label="Dari akun" name="akun_id" type="select" options={accounts} />
                  <Field label="Tanggal" name="tanggal_transaksi" type="date" defaultValue={data.today} />
                  <MoneyField label="Kurangi tagihan sebesar" name="pengurangan" hint="Opsional." />
                  <Field label="Alasan" name="alasan" required className="span-all" />
                </div>
                <CheckField label="Batalkan sisa kewajiban" name="batalkan" />
                <div className="form-actions">
                  <SubmitButton variant="danger">Catat refund</SubmitButton>
                </div>
              </FinanceForm>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

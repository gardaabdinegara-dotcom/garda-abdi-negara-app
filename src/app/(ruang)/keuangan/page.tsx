import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Field, SubmitButton } from "@/components/form";
import { FinanceForm, FinanceTabs, InvoiceBadge, KIND_LABEL, rp } from "@/components/keuangan";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import { canSeeChildBills } from "@/lib/core/permissions";
import { FINANCE_ACCESS_LABEL } from "@/lib/core/types";
import { text } from "@/lib/keuangan/domain";
import { accountName, invoiceList } from "@/lib/keuangan/ringkasan";
import { formatDate } from "@/lib/format";
import { loadFinance, overview } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Keuangan" };

export default async function FinancePage() {
  const actor = await requireActor();
  if (canSeeChildBills(actor)) redirect("/keuangan/tagihan");
  const data = await loadFinance(actor);
  const sum = overview(data);
  const invoices = invoiceList(data.state, data.today);
  const overdue = invoices.filter((i) => i.status === "JATUH_TEMPO").slice(0, 6);
  const recent = [...data.state.Transaksi].sort((a, b) => text(b, "tanggal_transaksi").localeCompare(text(a, "tanggal_transaksi"))).slice(0, 8);
  const ready = data.state.Akun.length > 0;

  return (
    <div className="page">
      <PageHead eyebrow={`Akses: ${FINANCE_ACCESS_LABEL[data.access]}`} title="Keuangan" description={FITUR.tagihan ? "Saldo kas dan bank, tagihan siswa, dan arus kas bulan berjalan." : "Catat pemasukan dan pengeluaran secara manual. Saldo, arus kas, dan laporan keuangan dibuat otomatis dari catatan itu."} />
      <FinanceTabs current="ringkasan" owner={data.owner} />
      {!ready ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Mulai pembukuan</h2>
              <p>Belum ada akun kas/bank. Langkah ini membuat akun kas tunai, rekening bank, serta kategori pemasukan dan pengeluaran yang sudah siap masuk laporan. Saldo awal bisa diubah di menu Akun & periode.</p>
            </div>
          </div>
          {data.owner ? (
            <FinanceForm aksi="finance.bootstrap" className="form-grid two">
              <Field label="Tanggal saldo awal" name="tanggal_saldo_awal" type="date" defaultValue={`${data.month}-01`} hint="Biasanya tanggal 1 bulan mulai pembukuan." />
              <div className="form-actions">
                <SubmitButton>Siapkan akun & kategori</SubmitButton>
              </div>
            </FinanceForm>
          ) : (
            <Notice>Pemilik perlu menyiapkan akun kas/bank terlebih dahulu.</Notice>
          )}
        </section>
      ) : null}
      {data.closed.length ? <Notice>Periode tertutup: {data.closed.sort().join(", ")}. Transaksi pada bulan itu tidak bisa diubah.</Notice> : null}
      <div className="grid-stats">
        <section className="card stat">
          <span className="stat-label">Saldo kas & bank</span>
          <span className="stat-value">{rp(sum.balance)}</span>
          <span className="stat-sub">Per {formatDate(data.today, "long")}</span>
        </section>
        <section className="card stat">
          <span className="stat-label">Masuk bulan ini</span>
          <span className="stat-value">{rp(sum.incoming)}</span>
          <span className="stat-sub">Operasional bersih {rp(sum.operational)}</span>
        </section>
        <section className="card stat">
          <span className="stat-label">Keluar bulan ini</span>
          <span className="stat-value">{rp(sum.outgoing)}</span>
          <span className="stat-sub">Biaya, refund, prive, dan pinjaman</span>
        </section>
        {FITUR.tagihan ? (
          <section className="card stat">
            <span className="stat-label">Piutang siswa</span>
            <span className="stat-value">{rp(sum.outstanding)}</span>
            <span className="stat-sub">{sum.overdue ? `${rp(sum.overdue)} lewat jatuh tempo` : "Tidak ada yang lewat jatuh tempo"}</span>
          </section>
        ) : (
          <section className="card stat">
            <span className="stat-label">Selisih bulan ini</span>
            <span className="stat-value">{rp(sum.incoming - sum.outgoing)}</span>
            <span className="stat-sub">Masuk dikurangi keluar</span>
          </section>
        )}
      </div>
      <div className="grid-main">
        <div className="stack">
          {FITUR.tagihan ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Tagihan lewat jatuh tempo</h2>
                <p>Cicilan yang tanggalnya sudah lewat dan belum dibayar penuh.</p>
              </div>
              <Link href="/keuangan/tagihan?status=JATUH_TEMPO" className="btn btn-secondary btn-sm">
                Semua tagihan
              </Link>
            </div>
            {overdue.length === 0 ? (
              <Empty title="Tidak ada tunggakan" />
            ) : (
              <div className="item-list">
                {overdue.map((i) => (
                  <div className="item" key={String(i.invoice.tagihan_id)}>
                    <div className="item-main">
                      <Link className="cell-title" href={`/keuangan/tagihan/${String(i.invoice.tagihan_id)}`}>
                        {i.student.nama}
                      </Link>
                      <span className="cell-sub">
                        {i.student.program} · {String(i.invoice.nomor_tagihan)}
                      </span>
                    </div>
                    <div className="row">
                      <Badge tone="danger">{rp(i.summary.overdue)}</Badge>
                      <InvoiceBadge status={i.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          ) : null}
          <section className="card">
            <div className="card-head">
              <h2>Transaksi terbaru</h2>
              <Link href="/keuangan/transaksi" className="btn btn-secondary btn-sm">
                Semua transaksi
              </Link>
            </div>
            {recent.length === 0 ? (
              <Empty title="Belum ada transaksi" />
            ) : (
              <div className="item-list">
                {recent.map((t) => (
                  <div className="item" key={String(t.transaksi_id)}>
                    <div className="item-main">
                      <b>{text(t, "deskripsi") || KIND_LABEL[text(t, "jenis")]}</b>
                      <span className="cell-sub">
                        {formatDate(text(t, "tanggal_transaksi"))} · {KIND_LABEL[text(t, "jenis")] ?? text(t, "jenis")} · {accountName(data.state, t.akun_id)}
                      </span>
                    </div>
                    <b className={t.arah === "IN" ? "amount-in" : "amount-out"}>
                      {t.arah === "IN" ? "+" : "−"}
                      {rp(Number(t.nominal))}
                    </b>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <section className="card">
          <div className="card-head">
            <h2>Akun kas & bank</h2>
          </div>
          {sum.accounts.length === 0 ? (
            <Empty title="Belum ada akun" />
          ) : (
            <div className="item-list">
              {sum.accounts.map((a) => (
                <div className="item" key={String(a.akun_id)}>
                  <div className="item-main">
                    <b>{String(a.nama_akun)}</b>
                    <span className="cell-sub">
                      {String(a.jenis_akun)} · saldo awal {formatDate(String(a.tanggal_saldo_awal))}
                    </span>
                  </div>
                  <b>{a.available ? rp(a.balance) : "Belum dibuka"}</b>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

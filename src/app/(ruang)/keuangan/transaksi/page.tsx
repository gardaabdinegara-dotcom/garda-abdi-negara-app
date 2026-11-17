import type { Metadata } from "next";
import Link from "next/link";
import { Field, SubmitButton } from "@/components/form";
import { accountOptions, FinanceForm, FinanceTabs, KIND_LABEL, MoneyField, rp } from "@/components/keuangan";
import { monthLabel } from "@/components/report-document";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { endOfMonth, num, text } from "@/lib/keuangan/domain";
import { accountName, categoryName, reversedIds } from "@/lib/keuangan/ringkasan";
import { formatDate } from "@/lib/format";
import { FITUR } from "@/lib/core/fitur";
import { EDITABLE_KINDS } from "@/lib/keuangan/sumber";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: FITUR.tagihan ? "Transaksi" : "Pemasukan & pengeluaran" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const KINDS = ["PENERIMAAN_LAIN", "BIAYA", "MODAL_MASUK", "PRIVE", "PINJAMAN_MASUK", "POKOK_PINJAMAN_KELUAR"].map((k) => ({ value: k, label: KIND_LABEL[k]! }));

export default async function TransactionsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  const params = await searchParams;
  const month = typeof params.bulan === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.bulan) ? params.bulan : data.month;
  const akun = typeof params.akun === "string" ? params.akun : "";
  const reversed = reversedIds(data.state);
  // Transaksi yang sudah dihapus/diubah beserta pembaliknya disembunyikan, kecuali diminta (?koreksi=1).
  const showCorrections = params.koreksi === "1";
  const rows = data.state.Transaksi.filter(
    (t) =>
      text(t, "tanggal_transaksi") >= `${month}-01` &&
      text(t, "tanggal_transaksi") <= endOfMonth(month) &&
      (!akun || t.akun_id === akun) &&
      (showCorrections || (t.jenis !== "PEMBALIK" && !reversed.has(text(t, "transaksi_id")))),
  ).sort((a, b) => text(b, "tanggal_transaksi").localeCompare(text(a, "tanggal_transaksi")) || Number(b.line_no) - Number(a.line_no));
  const incoming = rows.filter((t) => t.arah === "IN").reduce((s, t) => s + num(t, "nominal"), 0);
  const outgoing = rows.filter((t) => t.arah === "OUT").reduce((s, t) => s + num(t, "nominal"), 0);
  const accounts = accountOptions(data.state.Akun);
  const categories = data.state.Kategori.filter((k) => k.aktif === true || k.aktif === "true").map((k) => ({
    value: text(k, "kategori_id"),
    label: `${text(k, "nama_kategori")} (${text(k, "jenis_yang_diizinkan").split(",").map((j) => KIND_LABEL[j] ?? j).join(", ")})`,
  }));
  const programs = data.state.Program.map((p) => ({ value: text(p, "program_id"), label: text(p, "nama_program") }));

  return (
    <div className="page">
      <PageHead
        eyebrow="Keuangan"
        title={FITUR.tagihan ? "Transaksi" : "Pemasukan & pengeluaran"}
        description={
          FITUR.tagihan
            ? "Buku kas per bulan. Transaksi tidak pernah dihapus; kesalahan dikoreksi dengan pembalik oleh pemilik."
            : "Catat setiap uang masuk dan keluar. Laporan keuangan dibuat otomatis dari catatan ini. Salah catat? Tekan Ubah / hapus pada barisnya."
        }
      />
      <FinanceTabs current="transaksi" owner={data.owner} />
      <section className="card">
        <form method="get" className="filters" aria-label="Saring transaksi">
          <div className="field">
            <label htmlFor="bulan">Bulan</label>
            <input id="bulan" type="month" name="bulan" defaultValue={month} />
          </div>
          <div className="field">
            <label htmlFor="akun">Akun</label>
            <select id="akun" name="akun" defaultValue={akun}>
              <option value="">Semua akun</option>
              {data.state.Akun.map((a) => (
                <option key={text(a, "akun_id")} value={text(a, "akun_id")}>
                  {text(a, "nama_akun")}
                </option>
              ))}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" name="koreksi" value="1" defaultChecked={showCorrections} />
            Tampilkan yang sudah diubah/dihapus
          </label>
          <button type="submit" className="btn btn-secondary">
            Tampilkan
          </button>
        </form>
      </section>
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{monthLabel(month)}</h2>
              <p>
                Masuk {rp(incoming)} · keluar {rp(outgoing)} · {rows.length} baris (termasuk transfer antar akun{showCorrections ? " dan koreksi" : ""})
              </p>
            </div>
            {data.closed.includes(month) ? <Badge>Periode ditutup</Badge> : null}
          </div>
          {rows.length === 0 ? (
            <Empty title="Tidak ada transaksi" />
          ) : (
            <div className="item-list">
              {rows.map((t) => {
                const id = text(t, "transaksi_id");
                const isReversed = reversed.has(id);
                return (
                  <div className="item" key={id}>
                    <div className="item-main">
                      <b>{text(t, "deskripsi") || KIND_LABEL[text(t, "jenis")]}</b>
                      <span className="cell-sub">
                        {formatDate(text(t, "tanggal_transaksi"))} · {KIND_LABEL[text(t, "jenis")] ?? text(t, "jenis")} · {accountName(data.state, t.akun_id)}
                        {t.kategori_id ? ` · ${categoryName(data.state, t.kategori_id)}` : ""}
                        {t.tagihan_id && FITUR.tagihan ? (
                          <>
                            {" · "}
                            <Link href={`/keuangan/tagihan/${text(t, "tagihan_id")}`}>tagihan</Link>
                          </>
                        ) : null}
                        {text(t, "bukti_url") ? (
                          <>
                            {" · "}
                            <a href={text(t, "bukti_url")} target="_blank" rel="noopener noreferrer nofollow">
                              bukti
                            </a>
                          </>
                        ) : null}
                      </span>
                    </div>
                    <div className="row">
                      {isReversed ? <Badge>Dikoreksi</Badge> : null}
                      <b className={t.arah === "IN" ? "amount-in" : "amount-out"}>
                        {t.arah === "IN" ? "+" : "−"}
                        {rp(num(t, "nominal"))}
                      </b>
                    </div>
                    {data.owner && !isReversed && !t.tagihan_id && EDITABLE_KINDS.includes(text(t, "jenis")) ? (
                      <details className="details-edit item-edit">
                        <summary className="btn btn-ghost btn-sm">Ubah / hapus</summary>
                        <FinanceForm aksi="transaction.edit" className="form-grid two" confirm="Simpan perubahan transaksi ini?">
                          <input type="hidden" name="transaksi_id" value={id} />
                          <MoneyField label="Nominal" name="nominal" defaultValue={num(t, "nominal")} required />
                          <Field label="Tanggal" name="tanggal_transaksi" type="date" defaultValue={text(t, "tanggal_transaksi")} />
                          <Field label="Akun" name="akun_id" type="select" options={accounts} defaultValue={text(t, "akun_id")} />
                          <Field label="Kategori" name="kategori_id" type="select" options={[{ value: "", label: "Tanpa kategori" }, ...categories]} defaultValue={text(t, "kategori_id")} />
                          <Field label="Keterangan" name="deskripsi" defaultValue={text(t, "deskripsi")} required className="span-all" />
                          <Field label="Alasan perubahan" name="alasan" placeholder="mis. salah nominal" className="span-all" />
                          <div className="form-actions">
                            <SubmitButton size="sm">Simpan perubahan</SubmitButton>
                          </div>
                        </FinanceForm>
                        <FinanceForm aksi="transaction.reverse" className="form-grid two" confirm="Hapus transaksi ini? Saldo dan laporan dikembalikan seperti sebelum dicatat.">
                          <input type="hidden" name="transaksi_id" value={id} />
                          <input type="hidden" name="tanggal_transaksi" value={text(t, "tanggal_transaksi")} />
                          <Field label="Alasan hapus" name="alasan" required placeholder="mis. tercatat dua kali" />
                          <div className="form-actions">
                            <SubmitButton size="sm" variant="danger">
                              Hapus transaksi
                            </SubmitButton>
                          </div>
                        </FinanceForm>
                      </details>
                    ) : data.owner && !isReversed && t.jenis !== "PEMBALIK" && !t.tagihan_id ? (
                      <details className="details-edit item-edit">
                        <summary className="btn btn-ghost btn-sm">Koreksi (pembalik)</summary>
                        <FinanceForm aksi="transaction.reverse" className="form-grid three" confirm="Buat pembalik untuk transaksi ini?">
                          <input type="hidden" name="transaksi_id" value={id} />
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
                );
              })}
            </div>
          )}
        </section>
        <div className="stack">
          {!data.recorder ? (
            <Notice>Akses Anda hanya untuk melihat.</Notice>
          ) : accounts.length === 0 ? (
            <Notice>Belum ada akun kas/bank. {data.owner ? "Siapkan dari halaman Ringkasan." : "Minta pemilik menyiapkannya."}</Notice>
          ) : (
            <>
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>{FITUR.tagihan ? "Catat transaksi" : "Catat pemasukan / pengeluaran"}</h2>
                    <p>{FITUR.tagihan ? "Pembayaran siswa dicatat dari halaman tagihan." : "Pembayaran bimbel: pilih Pemasukan, kategori Pembayaran bimbel siswa, dan tulis nama siswa di keterangan."}</p>
                  </div>
                </div>
                <FinanceForm aksi="transaction.create" resetOnSuccess>
                  <div className="form-grid two">
                    <Field label="Jenis" name="jenis" type="select" options={KINDS} defaultValue={FITUR.tagihan ? "BIAYA" : "PENERIMAAN_LAIN"} />
                    <MoneyField label="Nominal" name="nominal" required />
                    <Field label="Akun" name="akun_id" type="select" options={accounts} />
                    <Field label="Tanggal" name="tanggal_transaksi" type="date" defaultValue={data.today} />
                    <Field label="Kategori" name="kategori_id" type="select" options={[{ value: "", label: "Tanpa kategori" }, ...categories]} className="span-all" hint="Harus sesuai jenis. Kategori dipakai laporan laba rugi." />
                    <Field label="Keterangan" name="deskripsi" required className="span-all" placeholder={FITUR.tagihan ? undefined : "mis. Cicilan 2 - GAN-0005"} />
                    {FITUR.tagihan ? <Field label="Program (opsional)" name="program_id_opsional" type="select" options={[{ value: "", label: "Tanpa program" }, ...programs]} /> : null}
                    <Field label="Tautan bukti (opsional)" name="bukti_url" type="url" placeholder="https://…" />
                    {data.owner ? <Field label="Alasan bila saldo akun tidak cukup" name="alasan" className="span-all" hint="Khusus pemilik untuk penyesuaian." /> : null}
                  </div>
                  <div className="form-actions">
                    <SubmitButton>Simpan transaksi</SubmitButton>
                  </div>
                </FinanceForm>
              </section>
              <section className="card">
                <div className="card-head">
                  <h2>Transfer antar akun</h2>
                </div>
                <FinanceForm aksi="transfer.create" resetOnSuccess>
                  <div className="form-grid two">
                    <Field label="Dari akun" name="dari_akun_id" type="select" options={accounts} />
                    <Field label="Ke akun" name="ke_akun_id" type="select" options={accounts} defaultValue={accounts[1]?.value} />
                    <MoneyField label="Nominal" name="nominal" required />
                    <Field label="Tanggal" name="tanggal_transaksi" type="date" defaultValue={data.today} />
                    <Field label="Keterangan" name="deskripsi" className="span-all" placeholder="Setor tunai ke bank" />
                  </div>
                  <div className="form-actions">
                    <SubmitButton variant="secondary">Simpan transfer</SubmitButton>
                  </div>
                </FinanceForm>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckField, Field, SubmitButton } from "@/components/form";
import { FinanceForm, KeuanganHead, KeuanganSubHead, MoneyField, rp } from "@/components/keuangan";
import { Badge, Empty, Notice } from "@/components/ui";
import { num, text } from "@/lib/keuangan/domain";
import {
  CREDIT_ACCOUNTS,
  JOURNAL_ACCOUNTS,
  MAPPING_ACCOUNTS,
  mappingAt,
  OPENING_ACCOUNTS,
  openingRows,
  REPORT_ACCOUNTS,
  reportingAnchor,
  reportSetting,
  type ReportAccount,
} from "@/lib/keuangan/reporting";
import { formatDate } from "@/lib/format";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Penyesuaian laporan" };

const label = (key: string) => REPORT_ACCOUNTS[key as ReportAccount] ?? key;

export default async function ReportSettingsPage() {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  if (!data.owner) notFound();
  const s = data.state;
  const anchor = reportingAnchor(s);
  const basisSet = reportSetting(s, "reporting_basis") === "KAS_DISESUAIKAN";
  const opening = openingRows(s);
  const journals = [...new Set(s.Jurnal_Laporan.map((r) => text(r, "jurnal_id")))].map((id) => ({ id, lines: s.Jurnal_Laporan.filter((r) => r.jurnal_id === id) }));
  const reversedJournals = new Set(s.Jurnal_Laporan.map((r) => text(r, "jurnal_rujukan_id")).filter(Boolean));
  const costs = s.Transaksi.filter((t) => t.jenis === "BIAYA").sort((a, b) => text(b, "tanggal_transaksi").localeCompare(text(a, "tanggal_transaksi")));
  const linked = new Set([...s.Aset.map((a) => text(a, "transaksi_id")), ...s.Pembayaran_Pajak.map((p) => text(p, "transaksi_id"))]);
  const costOptions = costs.filter((t) => !linked.has(text(t, "transaksi_id"))).slice(0, 80).map((t) => ({ value: text(t, "transaksi_id"), label: `${formatDate(text(t, "tanggal_transaksi"))} · ${rp(num(t, "nominal"))} · ${text(t, "deskripsi")}` }));
  const accountOptions = (keys: readonly string[]) => [{ value: "", label: "Tidak dipilih" }, ...keys.map((k) => ({ value: k, label: label(k) }))];

  return (
    <div className="page kg-page">
      <KeuanganHead current="penyesuaian" />
      <KeuanganSubHead
        title="Penyesuaian laporan"
        description="Opsional, untuk pembukuan rapi: dasar laporan, pemetaan kategori, aset & penyusutan, saldo awal neraca, jurnal nonkas, dan pajak. Khusus pemilik."
      />
      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>1. Dasar laporan</h2>
              <p>Kas dengan penyesuaian nonkas. Tanggal awal pembukuan dikunci setelah aset, saldo awal, atau jurnal dicatat.</p>
            </div>
            {basisSet ? <Badge tone="success">Sudah ditetapkan</Badge> : <Badge tone="warning">Belum</Badge>}
          </div>
          <FinanceForm aksi="report.profile">
            <div className="form-grid two">
              <Field label="Awal pembukuan" name="tanggal_mulai" type="date" defaultValue={anchor.startsWith("9999") ? `${data.month}-01` : anchor} />
              <Field
                label="Dasar omzet pajak"
                name="dasar_pajak"
                type="select"
                defaultValue={reportSetting(s, "tax_basis")}
                options={[
                  { value: "", label: "Belum ditetapkan" },
                  { value: "KAS_BRUTO", label: "Penerimaan kas bruto" },
                  { value: "PENDAPATAN_BERSIH", label: "Pendapatan bersih" },
                ]}
              />
              <Field label="Tempat penandatanganan" name="report_location" defaultValue={reportSetting(s, "report_location")} />
              <Field label="Nama penandatangan" name="report_signer" defaultValue={reportSetting(s, "report_signer")} />
              <Field label="Jabatan" name="report_position" defaultValue={reportSetting(s, "report_position") || "Pemilik"} />
            </div>
            <CheckField label="Saya memahami laporan memakai dasar kas dengan penyesuaian nonkas (aset, penyusutan, jurnal)." name="confirmed" defaultChecked={basisSet} />
            <div className="form-actions">
              <SubmitButton>Simpan dasar laporan</SubmitButton>
            </div>
          </FinanceForm>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>2. Pemetaan kategori</h2>
              <p>Kelompok laba rugi untuk setiap kategori transaksi. Berlaku mulai bulan yang dipilih.</p>
            </div>
          </div>
          {s.Kategori.length === 0 ? (
            <Empty title="Belum ada kategori" />
          ) : (
            <FinanceForm aksi="report.mapping">
              <Field label="Berlaku mulai" name="berlaku_mulai" type="date" defaultValue={anchor.startsWith("9999") ? `${data.month}-01` : anchor} />
              <div className="form-grid two">
                {s.Kategori.map((k) => {
                  const incoming = text(k, "jenis_yang_diizinkan").split(",").includes("PENERIMAAN_LAIN");
                  const keys = MAPPING_ACCOUNTS.filter((a) => (incoming ? ["PENDAPATAN", "PENDAPATAN_LAIN"] : MAPPING_ACCOUNTS.filter((x) => !["PENDAPATAN", "PENDAPATAN_LAIN"].includes(x))).includes(a));
                  return (
                    <Field
                      key={text(k, "kategori_id")}
                      label={text(k, "nama_kategori")}
                      name={`map:${text(k, "kategori_id")}`}
                      type="select"
                      defaultValue={mappingAt(s, text(k, "kategori_id"), data.today)}
                      options={accountOptions(keys)}
                    />
                  );
                })}
              </div>
              <div className="form-actions">
                <SubmitButton>Simpan pemetaan</SubmitButton>
              </div>
            </FinanceForm>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>3. Aset & penyusutan</h2>
              <p>Penyusutan garis lurus per bulan. Pembelian aset dipisahkan dari biaya.</p>
            </div>
          </div>
          {s.Aset.length ? (
            <div className="item-list">
              {s.Aset.map((a) => (
                <div className="item" key={text(a, "aset_id")}>
                  <div className="item-main">
                    <b>{text(a, "nama_aset")}</b>
                    <span className="cell-sub">
                      {rp(num(a, "harga_perolehan"))} · {num(a, "umur_bulan")} bulan · mulai {formatDate(text(a, "tanggal_mulai"))} · {text(a, "sumber") === "SALDO_AWAL" ? "saldo awal" : "dari transaksi"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <FinanceForm aksi="report.asset" resetOnSuccess>
            <div className="form-grid two">
              <Field label="Nama aset" name="nama_aset" required className="span-all" />
              <Field
                label="Sumber"
                name="sumber"
                type="select"
                options={[
                  { value: "TRANSAKSI", label: "Pembelian tercatat (transaksi biaya)" },
                  { value: "SALDO_AWAL", label: "Sudah dimiliki sebelum awal pembukuan" },
                ]}
              />
              <Field label="Transaksi pembelian" name="transaksi_id" type="select" options={[{ value: "", label: "Tidak dipilih" }, ...costOptions]} />
              <Field label="Tanggal perolehan" name="tanggal_perolehan" type="date" defaultValue={data.today} />
              <Field label="Mulai disusutkan (bulan)" name="tanggal_mulai" type="date" defaultValue={`${data.month}-01`} />
              <MoneyField label="Harga perolehan" name="harga_perolehan" required />
              <Field label="Umur (bulan)" name="umur_bulan" type="number" min={1} max={600} defaultValue={48} />
              <MoneyField label="Nilai residu" name="nilai_residu" />
              <MoneyField label="Akumulasi awal (aset saldo awal)" name="akumulasi_awal" />
            </div>
            <div className="form-actions">
              <SubmitButton>Simpan aset</SubmitButton>
            </div>
          </FinanceForm>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>4. Saldo awal neraca</h2>
              <p>Per {anchor.startsWith("9999") ? "awal pembukuan" : formatDate(anchor, "long")}. Kas/bank dan aset dihitung otomatis; harus seimbang.</p>
            </div>
            {opening.length ? <Badge tone="success">Versi {Math.max(...opening.map((r) => num(r, "versi")))}</Badge> : <Badge tone="warning">Belum</Badge>}
          </div>
          {!basisSet ? (
            <Notice>Tetapkan dasar laporan terlebih dahulu.</Notice>
          ) : (
            <FinanceForm aksi="report.opening">
              <div className="form-grid two">
                {OPENING_ACCOUNTS.map((key) => {
                  const row = opening.find((r) => r.akun_laporan === key);
                  const value = row ? Math.abs(num(row, "debit") - num(row, "kredit")) : 0;
                  return <MoneyField key={key} label={`${label(key)}${CREDIT_ACCOUNTS.includes(key) ? " (kredit)" : ""}`} name={`open:${key}`} defaultValue={value} />;
                })}
                <Field label="Sumber/verifikasi" name="sumber" required className="span-all" placeholder="mis. Neraca akhir tahun lalu, ditandatangani pemilik" />
              </div>
              <CheckField label="Saya sudah memverifikasi sumber saldo awal." name="verified" />
              <div className="form-actions">
                <SubmitButton>Simpan saldo awal</SubmitButton>
              </div>
            </FinanceForm>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>5. Jurnal nonkas</h2>
              <p>Utang, piutang, uang muka, dan penyesuaian lain yang tidak melalui kas. Debit dan kredit harus sama.</p>
            </div>
          </div>
          {journals.length ? (
            <div className="item-list">
              {journals.map((j) => (
                <div className="item" key={j.id}>
                  <div className="item-main">
                    <b>{text(j.lines[0], "deskripsi")}</b>
                    <span className="cell-sub">
                      {formatDate(text(j.lines[0], "tanggal"))} · {j.lines.map((l) => `${label(text(l, "akun_laporan"))} ${num(l, "debit") ? "D" : "K"} ${rp(num(l, "debit") || num(l, "kredit"))}`).join(" · ")}
                    </span>
                  </div>
                  {text(j.lines[0], "jurnal_rujukan_id") ? (
                    <Badge>Pembalik</Badge>
                  ) : reversedJournals.has(j.id) ? (
                    <Badge>Dibalik</Badge>
                  ) : (
                    <details className="details-edit item-edit">
                      <summary className="btn btn-ghost btn-sm">Balik jurnal</summary>
                      <FinanceForm aksi="report.journal.reverse" className="form-grid three">
                        <input type="hidden" name="jurnal_id" value={j.id} />
                        <Field label="Tanggal" name="tanggal" type="date" defaultValue={data.today} />
                        <Field label="Alasan" name="deskripsi" required />
                        <div className="form-actions">
                          <SubmitButton size="sm">Simpan</SubmitButton>
                        </div>
                      </FinanceForm>
                    </details>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <FinanceForm aksi="report.journal" resetOnSuccess>
            <div className="form-grid two">
              <Field label="Tanggal" name="tanggal" type="date" defaultValue={data.today} />
              <Field label="Rujukan" name="rujukan" placeholder="No. nota / dokumen" />
              <Field label="Keterangan" name="deskripsi" required className="span-all" />
            </div>
            {[1, 2, 3, 4].map((i) => (
              <div className="form-grid three" key={i}>
                <Field label={`Akun baris ${i}`} name={`akun_${i}`} type="select" options={accountOptions(JOURNAL_ACCOUNTS)} />
                <MoneyField label="Debit" name={`debit_${i}`} />
                <MoneyField label="Kredit" name={`kredit_${i}`} />
              </div>
            ))}
            <div className="form-actions">
              <SubmitButton>Simpan jurnal</SubmitButton>
            </div>
          </FinanceForm>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h2>6. Pajak</h2>
              <p>Tarif atas omzet (mis. PPh final 0,5%) dan penautan transaksi biaya sebagai pembayaran pajak.</p>
            </div>
          </div>
          {s.Tarif_Pajak.length ? (
            <ul className="plain-list muted">
              {s.Tarif_Pajak.map((t) => (
                <li key={text(t, "tarif_id")}>
                  Mulai {formatDate(text(t, "berlaku_mulai"))}: {(num(t, "tarif_basis_poin") / 100).toLocaleString("id-ID")}% · {text(t, "catatan")}
                </li>
              ))}
            </ul>
          ) : null}
          <FinanceForm aksi="report.tax.rate" className="form-grid three" resetOnSuccess>
            <Field label="Berlaku mulai" name="berlaku_mulai" type="date" defaultValue={`${data.month}-01`} />
            <Field label="Tarif (%)" name="tarif_persen" placeholder="0,5" required />
            <Field label="Dasar / catatan" name="catatan" required />
            <div className="form-actions">
              <SubmitButton size="sm">Simpan tarif</SubmitButton>
            </div>
          </FinanceForm>
          <FinanceForm aksi="report.tax.payment" resetOnSuccess>
            <h3>Tautkan pembayaran pajak</h3>
            {costOptions.length === 0 ? (
              <Notice>Belum ada transaksi biaya yang bisa ditautkan.</Notice>
            ) : (
              <div className="form-grid two">
                <Field label="Transaksi biaya" name="transaksi_id" type="select" options={costOptions} className="span-all" />
                <Field label="Periode pajak" name="periode_pajak" placeholder="YYYY-MM atau YYYY" required />
                <Field
                  label="Perlakuan"
                  name="perlakuan"
                  type="select"
                  options={[
                    { value: "BEBAN", label: "Beban pajak periode berjalan" },
                    { value: "PELUNASAN_UTANG", label: "Pelunasan utang pajak" },
                  ]}
                />
                <Field label="Catatan" name="catatan" required className="span-all" />
              </div>
            )}
            <div className="form-actions">
              <SubmitButton size="sm" variant="secondary">
                Tautkan
              </SubmitButton>
            </div>
          </FinanceForm>
        </section>
      </div>
    </div>
  );
}

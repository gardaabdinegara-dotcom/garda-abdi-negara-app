import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FITUR } from "@/lib/core/fitur";
import Link from "next/link";
import { Field, SubmitButton } from "@/components/form";
import { FinanceForm, FinanceTabs, InvoiceBadge, MoneyField, rp } from "@/components/keuangan";
import { Badge, Empty, Notice, PageHead } from "@/components/ui";
import { canSeeChildBills } from "@/lib/core/permissions";
import { text } from "@/lib/keuangan/domain";
import { invoiceList, type InvoiceStatus } from "@/lib/keuangan/ringkasan";
import { formatDate } from "@/lib/format";
import { monthLabel } from "@/components/report-document";
import { loadFamilyBills, loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tagihan" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const STATUS: { value: string; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "BELUM", label: "Belum lunas" },
  { value: "JATUH_TEMPO", label: "Lewat jatuh tempo" },
  { value: "LUNAS", label: "Lunas" },
  { value: "BATAL", label: "Dibatalkan" },
];

export default async function BillsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  // Tagihan siswa disembunyikan (lib/core/fitur.ts): keuangan dicatat manual lewat Transaksi.
  if (!FITUR.tagihan) notFound();
  if (canSeeChildBills(actor)) return <FamilyBills actor={actor} />;
  const data = await loadFinance(actor);
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const q = typeof params.q === "string" ? params.q.trim().toLowerCase() : "";
  const all = invoiceList(data.state, data.today);
  const shown = all.filter((i) => {
    if (status === "BELUM" && !(i.status === "BELUM_LUNAS" || i.status === "JATUH_TEMPO")) return false;
    if (status && status !== "BELUM" && i.status !== (status as InvoiceStatus)) return false;
    return !q || i.student.nama.toLowerCase().includes(q) || text(i.invoice, "nomor_tagihan").toLowerCase().includes(q);
  });

  const enrollments = data.state.Pendaftaran.filter((p) => p.status === "AKTIF").map((p) => {
    const student = data.state.Siswa.find((s) => s.siswa_id === p.siswa_id);
    const program = data.state.Program.find((r) => r.program_id === p.program_id);
    return { p, nama: text(student, "nama"), program: text(program, "nama_program"), ready: p.ketentuan_ada === true && Number(p.tarif_disepakati) > 0 };
  });
  const packageReady = enrollments.filter((e) => e.ready && e.p.skema_biaya === "PAKET");
  const monthlyReady = enrollments.filter((e) => e.ready && e.p.skema_biaya === "BULANAN");
  const billedThisMonth = new Set(
    data.state.Tagihan.filter((i) => i.jenis_tagihan === "BULANAN" && i.periode_layanan === data.month).map((i) => text(i, "pendaftaran_id")),
  );
  const missingFee = enrollments.filter((e) => !e.ready).length;

  return (
    <div className="page">
      <PageHead eyebrow="Keuangan" title="Tagihan" description="Tagihan paket (boleh dicicil) dan tagihan bulanan per pendaftaran. Pembayaran dicatat dari halaman rincian tagihan." />
      <FinanceTabs current="tagihan" owner={data.owner} />
      <section className="card">
        <form method="get" className="filters" aria-label="Saring tagihan">
          <div className="field">
            <label htmlFor="q">Cari</label>
            <input id="q" name="q" type="search" defaultValue={q} placeholder="Nama siswa atau nomor tagihan" />
          </div>
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status}>
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-secondary">
            Terapkan
          </button>
        </form>
      </section>
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <h2>Daftar tagihan</h2>
            <Badge>
              {shown.length} dari {all.length}
            </Badge>
          </div>
          {shown.length === 0 ? (
            <Empty title={all.length ? "Tidak ada yang cocok" : "Belum ada tagihan"} />
          ) : (
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Siswa</th>
                    <th>Terbit</th>
                    <th className="num">Nilai</th>
                    <th className="num">Sisa</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={text(i.invoice, "tagihan_id")}>
                      <td data-label="">
                        <Link className="cell-title" href={`/keuangan/tagihan/${text(i.invoice, "tagihan_id")}`}>
                          {i.student.nama}
                        </Link>
                        <span className="cell-sub">
                          {i.student.program}
                          {text(i.invoice, "periode_layanan") ? ` · ${monthLabel(text(i.invoice, "periode_layanan"))}` : " · paket"} · <span className="mono">{text(i.invoice, "nomor_tagihan")}</span>
                        </span>
                      </td>
                      <td data-label="Terbit">{formatDate(text(i.invoice, "tanggal_terbit"))}</td>
                      <td data-label="Nilai" className="num">
                        {rp(i.summary.face)}
                      </td>
                      <td data-label="Sisa" className="num">
                        <b>{rp(i.summary.remaining)}</b>
                        {i.nextDue ? <span className="cell-sub">berikutnya {formatDate(i.nextDue.date)}</span> : null}
                      </td>
                      <td data-label="Status">
                        <InvoiceBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="stack">
          {missingFee ? (
            <Notice tone="warning">
              {missingFee} pendaftaran aktif belum punya ketentuan biaya. Atur di <Link href="/keuangan/biaya">Tarif & biaya</Link>.
            </Notice>
          ) : null}
          {data.recorder ? (
            <>
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Terbitkan tagihan paket</h2>
                    <p>Bisa dicicil sampai 24 kali; nominal dibagi rata dan sisa pembulatan masuk cicilan terakhir.</p>
                  </div>
                </div>
                {packageReady.length === 0 ? (
                  <Empty title="Tidak ada pendaftaran paket yang siap ditagih" />
                ) : (
                  <FinanceForm aksi="invoice.create" resetOnSuccess>
                    <Field
                      label="Pendaftaran"
                      name="pendaftaran_id"
                      type="select"
                      options={packageReady.map((e) => ({ value: String(e.p.pendaftaran_id), label: `${e.nama} · ${e.program} (${rp(Number(e.p.tarif_disepakati))})` }))}
                    />
                    <div className="form-grid two">
                      <Field label="Tanggal terbit" name="tanggal_terbit" type="date" defaultValue={data.today} required />
                      <Field label="Jumlah cicilan" name="cicilan" type="number" min={1} max={24} defaultValue={1} />
                      <Field label="Jatuh tempo pertama" name="jatuh_tempo_pertama" type="date" hint="Kosong = tanggal terbit." />
                      {data.owner ? <MoneyField label="Diskon awal" name="diskon_awal" hint="Khusus pemilik." /> : null}
                    </div>
                    <div className="form-actions">
                      <SubmitButton>Terbitkan</SubmitButton>
                    </div>
                  </FinanceForm>
                )}
              </section>
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Tagihan bulanan</h2>
                    <p>Terbitkan sekaligus untuk pendaftaran berskema bulanan. Yang sudah punya tagihan untuk bulan yang dipilih otomatis dilewati.</p>
                  </div>
                </div>
                {monthlyReady.length === 0 ? (
                  <Empty title="Tidak ada pendaftaran bulanan" />
                ) : (
                  <FinanceForm aksi="invoice.monthly">
                    <div className="form-grid two">
                      <Field label="Bulan layanan" name="periode_layanan" type="month" defaultValue={data.month} required />
                      <Field label="Tanggal terbit" name="tanggal_terbit" type="date" defaultValue={data.today} required />
                    </div>
                    <fieldset className="fieldset-plain stack">
                      <span className="field-label">Pendaftaran</span>
                      {monthlyReady.map((e) => (
                        <label className="check" key={String(e.p.pendaftaran_id)}>
                          <input type="checkbox" name="pendaftaran_ids" value={String(e.p.pendaftaran_id)} defaultChecked />
                          {e.nama} · {rp(Number(e.p.tarif_disepakati))}
                          {billedThisMonth.has(String(e.p.pendaftaran_id)) ? <Badge>sudah ditagih {monthLabel(data.month)}</Badge> : null}
                        </label>
                      ))}
                    </fieldset>
                    <div className="form-actions">
                      <SubmitButton>Terbitkan tagihan bulanan</SubmitButton>
                    </div>
                  </FinanceForm>
                )}
              </section>
            </>
          ) : (
            <Notice>Akses Anda hanya untuk melihat. Penerbitan tagihan dan pencatatan pembayaran memerlukan akses Catat.</Notice>
          )}
        </div>
      </div>
    </div>
  );
}

async function FamilyBills({ actor }: { actor: Awaited<ReturnType<typeof requireActor>> }) {
  const data = await loadFamilyBills(actor);
  const own = actor.user.peran === "SISWA";
  return (
    <div className="page">
      <PageHead
        eyebrow="Keuangan"
        title={own ? "Tagihan saya" : "Tagihan anak"}
        description={own ? "Biaya bimbel, jadwal cicilan, dan kuitansi pembayaranmu. Kuitansi muncul setelah admin mencatat pembayaran." : "Tagihan, jadwal cicilan, dan riwayat pembayaran anak yang ditautkan ke akun Anda."}
      />
      {data.children.length === 0 ? <Empty title="Belum tertaut">{own ? "Akun ini belum tertaut ke data siswa. Hubungi admin." : "Minta admin menautkan data anak ke akun Anda."}</Empty> : null}
      {data.children.map((child) => (
        <div className="stack" key={child.siswa_id}>
          {own ? null : <h2 className="section-title">{child.nama}</h2>}
          {child.invoices.length === 0 ? <Empty title="Belum ada tagihan" /> : null}
          {child.invoices.map((i) => (
            <section className="card" key={text(i.invoice, "tagihan_id")}>
              <div className="card-head">
                <div>
                  <h2>{i.student.program}</h2>
                  <p>
                    {text(i.invoice, "periode_layanan") ? monthLabel(text(i.invoice, "periode_layanan")) : "Paket"} · <span className="mono">{text(i.invoice, "nomor_tagihan")}</span> · terbit{" "}
                    {formatDate(text(i.invoice, "tanggal_terbit"))}
                  </p>
                </div>
                <InvoiceBadge status={i.status} />
              </div>
              <div className="report-summary">
                <div>
                  <span>Total tagihan</span>
                  <b>{rp(i.summary.face)}</b>
                </div>
                <div>
                  <span>Sudah dibayar</span>
                  <b>{rp(i.summary.paid)}</b>
                </div>
                <div>
                  <span>Sisa</span>
                  <b>{rp(i.summary.remaining)}</b>
                </div>
                <div>
                  <span>Jatuh tempo berikutnya</span>
                  <b>{i.nextDue ? formatDate(i.nextDue.date) : "-"}</b>
                </div>
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
                    {i.summary.schedules.map((j) => (
                      <tr key={text(j, "jadwal_id")}>
                        <td data-label="Cicilan">Ke-{text(j, "urutan")}</td>
                        <td data-label="Jatuh tempo">{formatDate(text(j, "jatuh_tempo"))}</td>
                        <td data-label="Nominal" className="num">
                          {rp(j.effective)}
                        </td>
                        <td data-label="Sisa" className="num">
                          {j.remaining ? <b>{rp(j.remaining)}</b> : <Badge tone="success">Lunas</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {i.payments.length ? (
                <div className="item-list">
                  {i.payments.map((p) => (
                    <div className="item" key={text(p.tx, "transaksi_id")}>
                      <div className="item-main">
                        <b>{rp(Number(p.tx.nominal))}</b>
                        <span className="cell-sub">
                          Dibayar {formatDate(text(p.tx, "tanggal_transaksi"))} · {text(p.tx, "metode_pembayaran")}
                        </span>
                      </div>
                      <Link className="btn btn-secondary btn-sm" href={`/keuangan/kuitansi/${text(p.tx, "transaksi_id")}`}>
                        Kuitansi
                      </Link>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

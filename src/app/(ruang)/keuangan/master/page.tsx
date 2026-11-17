import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckField, Field, SubmitButton } from "@/components/form";
import { FinanceForm, KeuanganHead, KeuanganSubHead, KIND_LABEL, MoneyField, rp } from "@/components/keuangan";
import { bulanLabel as monthLabel } from "@/lib/keuangan/dompet";
import { ActiveBadge, Badge, Empty } from "@/components/ui";
import { endOfMonth, finance, num, reconciliationFor, text, type Row } from "@/lib/keuangan/domain";
import { formatDate } from "@/lib/format";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Akun & periode" };

type Search = Promise<Record<string, string | string[] | undefined>>;

const ACCOUNT_TYPES = [
  { value: "KAS", label: "Kas tunai" },
  { value: "BANK", label: "Bank" },
  { value: "EWALLET", label: "Dompet digital" },
];
const CATEGORY_KINDS = ["BIAYA", "PENERIMAAN_LAIN", "MODAL_MASUK", "PRIVE", "PINJAMAN_MASUK", "POKOK_PINJAMAN_KELUAR"];
const FLOW = [
  { value: "OPERASIONAL", label: "Operasional" },
  { value: "INVESTASI", label: "Investasi" },
  { value: "PENDANAAN", label: "Pendanaan" },
];

function AccountFields({ account, today }: { account?: Row; today: string }) {
  return (
    <div className="form-grid two">
      <Field label="Nama akun" name="nama_akun" defaultValue={text(account, "nama_akun")} required />
      <Field label="Jenis" name="jenis_akun" type="select" defaultValue={text(account, "jenis_akun") || "BANK"} options={ACCOUNT_TYPES} />
      <MoneyField label="Saldo awal" name="saldo_awal" defaultValue={account ? num(account, "saldo_awal") : 0} hint="Tidak bisa diubah setelah akun dipakai." />
      <Field label="Tanggal saldo awal" name="tanggal_saldo_awal" type="date" defaultValue={text(account, "tanggal_saldo_awal") || today} />
    </div>
  );
}

function CategoryFields({ category }: { category?: Row }) {
  const kinds = text(category, "jenis_yang_diizinkan").split(",");
  return (
    <div className="stack">
      <div className="form-grid two">
        <Field label="Nama kategori" name="nama_kategori" defaultValue={text(category, "nama_kategori")} required />
        <Field label="Kelompok arus kas" name="kelompok_arus" type="select" defaultValue={text(category, "kelompok_arus") || "OPERASIONAL"} options={FLOW} />
      </div>
      <fieldset className="fieldset-plain">
        <span className="field-label">Boleh dipakai untuk</span>
        <div className="row">
          {CATEGORY_KINDS.map((k) => (
            <label className="check" key={k}>
              <input type="checkbox" name="jenis_yang_diizinkan" value={k} defaultChecked={category ? kinds.includes(k) : k === "BIAYA"} />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default async function MasterPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor();
  const data = await loadFinance(actor);
  if (!data.owner) notFound();
  const params = await searchParams;
  const month = typeof params.bulan === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.bulan) ? params.bulan : data.month;
  const expected = finance(data.state, `${month}-01`, endOfMonth(month)).accounts.filter((a) => a.available);
  const last = reconciliationFor(data.state, month);
  const closed = data.closed.includes(month);

  return (
    <div className="page kg-page">
      <KeuanganHead current="master" />
      <KeuanganSubHead title="Akun & periode" description="Akun kas dan bank, kategori, pencocokan saldo, dan tutup buku bulanan. Khusus pemilik." />
      <div className="grid-2">
        <section className="card" id="akun">
          <div className="card-head">
            <h2>Akun kas & bank</h2>
          </div>
          {data.state.Akun.length === 0 ? <Empty title="Belum ada akun" /> : null}
          <div className="item-list">
            {data.state.Akun.map((a) => (
              <div className="item" key={text(a, "akun_id")}>
                <div className="item-main">
                  <b>{text(a, "nama_akun")}</b>
                  <span className="cell-sub">
                    {text(a, "jenis_akun")} · saldo awal {rp(num(a, "saldo_awal"))} per {formatDate(text(a, "tanggal_saldo_awal"))}
                  </span>
                </div>
                <ActiveBadge active={a.aktif === true || a.aktif === "true"} />
                <details className="details-edit item-edit">
                  <summary className="btn btn-ghost btn-sm">Ubah</summary>
                  <FinanceForm aksi="master.save">
                    <input type="hidden" name="table" value="Akun" />
                    <input type="hidden" name="id" value={text(a, "akun_id")} />
                    <AccountFields account={a} today={data.today} />
                    <CheckField label="Akun aktif" name="aktif" defaultChecked={a.aktif === true || a.aktif === "true"} />
                    <div className="form-actions">
                      <SubmitButton size="sm">Simpan akun</SubmitButton>
                    </div>
                  </FinanceForm>
                </details>
              </div>
            ))}
          </div>
          <FinanceForm aksi="master.save" resetOnSuccess>
            <h3>Tambah akun</h3>
            <input type="hidden" name="table" value="Akun" />
            <AccountFields today={data.today} />
            <div className="form-actions">
              <SubmitButton>Tambah akun</SubmitButton>
            </div>
          </FinanceForm>
        </section>

        <section className="card" id="kategori">
          <div className="card-head">
            <h2>Kategori transaksi</h2>
          </div>
          {data.state.Kategori.length === 0 ? <Empty title="Belum ada kategori" /> : null}
          <div className="item-list">
            {data.state.Kategori.map((k) => (
              <div className="item" key={text(k, "kategori_id")}>
                <div className="item-main">
                  <b>{text(k, "nama_kategori")}</b>
                  <span className="cell-sub">
                    {text(k, "jenis_yang_diizinkan")
                      .split(",")
                      .map((j) => KIND_LABEL[j] ?? j)
                      .join(", ")}
                  </span>
                </div>
                <ActiveBadge active={k.aktif === true || k.aktif === "true"} />
                <details className="details-edit item-edit">
                  <summary className="btn btn-ghost btn-sm">Ubah</summary>
                  <FinanceForm aksi="master.save">
                    <input type="hidden" name="table" value="Kategori" />
                    <input type="hidden" name="id" value={text(k, "kategori_id")} />
                    <CategoryFields category={k} />
                    <CheckField label="Kategori aktif" name="aktif" defaultChecked={k.aktif === true || k.aktif === "true"} />
                    <div className="form-actions">
                      <SubmitButton size="sm">Simpan kategori</SubmitButton>
                    </div>
                  </FinanceForm>
                </details>
              </div>
            ))}
          </div>
          <FinanceForm aksi="master.save" resetOnSuccess>
            <h3>Tambah kategori</h3>
            <input type="hidden" name="table" value="Kategori" />
            <CategoryFields />
            <div className="form-actions">
              <SubmitButton>Tambah kategori</SubmitButton>
            </div>
          </FinanceForm>
        </section>
      </div>

      <section className="card" id="tutup-bulan">
        <div className="card-head">
          <div>
            <h2>Pencocokan saldo & tutup buku</h2>
            <p>Isi saldo nyata tiap akun di akhir bulan (rekening koran/hitung kas). Bulan hanya bisa ditutup bila semua selisih nol.</p>
          </div>
          <form method="get" className="row">
            <input type="month" name="bulan" defaultValue={month} aria-label="Bulan" />
            <button type="submit" className="btn btn-secondary btn-sm">
              Pilih
            </button>
          </form>
        </div>
        {closed ? (
          <FinanceForm aksi="period.open" className="form-grid two" confirm={`Buka kembali ${monthLabel(month)}?`}>
            <input type="hidden" name="bulan" value={month} />
            <Field label={`${monthLabel(month)} sudah ditutup. Alasan membuka kembali`} name="alasan" required />
            <div className="form-actions">
              <SubmitButton variant="danger">Buka kembali</SubmitButton>
            </div>
          </FinanceForm>
        ) : expected.length === 0 ? (
          <Empty title="Belum ada akun pada bulan ini" />
        ) : (
          <FinanceForm>
            <input type="hidden" name="bulan" value={month} />
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Akun</th>
                    <th className="num">Saldo catatan</th>
                    <th>Saldo nyata</th>
                    {last ? <th className="num">Selisih terakhir</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {expected.map((a) => {
                    const prev = last?.accounts.find((x) => x.akun_id === a.akun_id);
                    return (
                      <tr key={text(a, "akun_id")}>
                        <td data-label="">{text(a, "nama_akun")}</td>
                        <td data-label="Saldo catatan" className="num">
                          {rp(a.balance)}
                        </td>
                        <td data-label="Saldo nyata">
                          <input name={`saldo:${text(a, "akun_id")}`} inputMode="numeric" defaultValue={(prev?.actual ?? a.balance ?? 0).toLocaleString("id-ID")} aria-label={`Saldo nyata ${text(a, "nama_akun")}`} />
                        </td>
                        {last ? (
                          <td data-label="Selisih terakhir" className="num">
                            {prev?.difference ? <Badge tone="danger">{rp(prev.difference)}</Badge> : <Badge tone="success">Cocok</Badge>}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Field label="Catatan pencocokan / alasan" name="alasan" required />
            <div className="form-actions">
              <SubmitButton variant="secondary" name="aksi" value="period.reconcile">
                Simpan pencocokan
              </SubmitButton>
              <SubmitButton name="aksi" value="period.close">
                Tutup {monthLabel(month)}
              </SubmitButton>
            </div>
            {last ? <p className="muted">Pencocokan terakhir {new Date(last.checkedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}: {last.note}</p> : null}
          </FinanceForm>
        )}
        {data.closed.length ? <p className="muted">Bulan tertutup: {data.closed.sort().map(monthLabel).join(", ")}.</p> : null}
      </section>

      <section className="card" id="cadangan">
        <div className="card-head">
          <div>
            <h2>Cadangan data</h2>
            <p>Unduh salinan JSON seluruh tab keuangan beserta data siswa/program terkait. Simpan di tempat aman; berisi data pribadi.</p>
          </div>
          <a className="btn btn-secondary" href="/keuangan/cadangan">
            Unduh cadangan
          </a>
        </div>
      </section>
    </div>
  );
}

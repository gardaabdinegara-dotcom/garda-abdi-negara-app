import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FITUR } from "@/lib/core/fitur";
import { Field, SubmitButton } from "@/components/form";
import { FinanceForm, FinanceTabs, MoneyField, rp } from "@/components/keuangan";
import { Badge, Empty, PageHead } from "@/components/ui";
import { text } from "@/lib/keuangan/domain";
import { loadFinance } from "@/lib/server/keuangan";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Tarif & biaya" };

const SCHEMES = [
  { value: "PAKET", label: "Paket (sekali tagih, boleh dicicil)" },
  { value: "BULANAN", label: "Bulanan" },
];

export default async function FeesPage() {
  const actor = await requireActor();
  // Tagihan siswa disembunyikan (lib/core/fitur.ts): keuangan dicatat manual lewat Transaksi.
  if (!FITUR.tagihan) notFound();
  const data = await loadFinance(actor);
  const enrollments = data.state.Pendaftaran.filter((p) => p.status === "AKTIF" || p.status === "CUTI")
    .map((p) => ({
      p,
      nama: text(data.state.Siswa.find((s) => s.siswa_id === p.siswa_id), "nama"),
      program: data.state.Program.find((r) => r.program_id === p.program_id),
    }))
    .sort((a, b) => Number(a.p.ketentuan_ada === true) - Number(b.p.ketentuan_ada === true) || a.nama.localeCompare(b.nama, "id"));

  return (
    <div className="page">
      <PageHead
        eyebrow="Keuangan"
        title="Tarif & biaya"
        description="Tarif bawaan per program dan ketentuan biaya per pendaftaran. Tarif khusus (berbeda dari tarif program) hanya bisa disetujui pemilik. Perubahan berlaku untuk tagihan berikutnya."
      />
      <FinanceTabs current="biaya" owner={data.owner} />
      <div className="grid-main">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Ketentuan biaya pendaftaran</h2>
              <p>Pendaftaran aktif atau cuti. Yang belum diatur ditampilkan paling atas.</p>
            </div>
          </div>
          {enrollments.length === 0 ? (
            <Empty title="Belum ada pendaftaran aktif" />
          ) : (
            <div className="item-list">
              {enrollments.map(({ p, nama, program }) => (
                <div className="item" key={String(p.pendaftaran_id)}>
                  <div className="item-main">
                    <b>{nama}</b>
                    <span className="cell-sub">
                      {text(program, "nama_program")} · {text(p, "angkatan") || "tanpa kelas"}
                      {p.status === "CUTI" ? " · cuti" : ""}
                    </span>
                  </div>
                  <div className="row">
                    {p.ketentuan_ada === true ? (
                      <Badge tone="info">
                        {text(p, "skema_biaya") === "BULANAN" ? "Bulanan" : "Paket"} · {rp(Number(p.tarif_disepakati))}
                        {text(p, "skema_biaya") === "BULANAN" ? ` · tgl ${text(p, "hari_jatuh_tempo")}` : ""}
                      </Badge>
                    ) : (
                      <Badge tone="warning">Belum diatur</Badge>
                    )}
                  </div>
                  {data.recorder ? (
                    <details className="details-edit item-edit">
                      <summary className="btn btn-ghost btn-sm">{p.ketentuan_ada === true ? "Ubah" : "Atur biaya"}</summary>
                      <FinanceForm aksi="fee.save" className="form-grid three">
                        <input type="hidden" name="pendaftaran_id" value={String(p.pendaftaran_id)} />
                        <Field label="Skema" name="skema_biaya" type="select" defaultValue={text(p, "skema_biaya")} options={SCHEMES} />
                        <MoneyField label="Tarif disepakati" name="tarif_disepakati" defaultValue={Number(p.tarif_disepakati)} hint={`Tarif program ${rp(Number(program?.tarif_default ?? 0))}`} />
                        <Field label="Tanggal jatuh tempo bulanan" name="hari_jatuh_tempo" type="number" min={1} max={31} defaultValue={Number(p.hari_jatuh_tempo) || 5} />
                        <div className="form-actions">
                          <SubmitButton size="sm">Simpan</SubmitButton>
                        </div>
                      </FinanceForm>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Tarif program</h2>
              <p>Tarif bawaan saat mengatur biaya pendaftaran baru.</p>
            </div>
          </div>
          {data.state.Program.length === 0 ? (
            <Empty title="Belum ada program">Buat program di Pengaturan → Program & kelas.</Empty>
          ) : (
            <div className="item-list">
              {data.state.Program.map((program) => (
                <div className="item" key={String(program.program_id)}>
                  <div className="item-main">
                    <b>{text(program, "nama_program")}</b>
                    <span className="cell-sub">{text(program, "skema_default") === "BULANAN" ? "Bulanan" : "Paket"}</span>
                  </div>
                  <b>{Number(program.tarif_default) ? rp(Number(program.tarif_default)) : "Belum diatur"}</b>
                  {data.owner ? (
                    <details className="details-edit item-edit">
                      <summary className="btn btn-ghost btn-sm">Ubah tarif</summary>
                      <FinanceForm aksi="tariff.save" className="form-grid three">
                        <input type="hidden" name="program_id" value={String(program.program_id)} />
                        <Field label="Skema" name="skema_default" type="select" defaultValue={text(program, "skema_default")} options={SCHEMES} />
                        <MoneyField label="Tarif" name="tarif_default" defaultValue={Number(program.tarif_default)} />
                        <div className="form-actions">
                          <SubmitButton size="sm">Simpan</SubmitButton>
                        </div>
                      </FinanceForm>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

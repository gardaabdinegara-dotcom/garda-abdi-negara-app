import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { simpanLembaga } from "@/app/actions/pengaturan";
import { ActionForm, CheckField, Field, SubmitButton } from "@/components/form";
import { Notice, PageHead } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import { canManageInstitution } from "@/lib/core/permissions";
import { loadSettings } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Pengaturan lembaga" };

const ZONES = [
  { value: "Asia/Jakarta", label: "WIB (Asia/Jakarta)" },
  { value: "Asia/Makassar", label: "WITA (Asia/Makassar)" },
  { value: "Asia/Jayapura", label: "WIT (Asia/Jayapura)" },
];

export default async function InstitutionPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const settings = await loadSettings();
  const editable = canManageInstitution(actor);

  return (
    <div className="page">
      <PageHead eyebrow="Pengaturan" title="Lembaga" description="Identitas lembaga, aturan presensi, dan isian tetap blangko Tes Samapta." />
      <SettingsTabs current="lembaga" owner={editable} />
      {editable ? null : <Notice>Hanya owner yang dapat mengubah pengaturan lembaga.</Notice>}
      <section className="card">
        <ActionForm action={simpanLembaga} operationId={randomUUID()} className="stack">
          <fieldset disabled={!editable} className="stack fieldset-plain">
            <h2>Identitas</h2>
            <div className="form-grid two">
              <Field label="Nama lembaga" name="nama_lembaga" defaultValue={settings.nama_lembaga} required />
              <Field label="Lokasi" name="lokasi" defaultValue={settings.lokasi} />
              <Field label="Zona waktu" name="zona_waktu" type="select" defaultValue={settings.zona_waktu} options={ZONES} />
              <Field
                label="Kapasitas siswa aktif"
                name="kapasitas_siswa"
                type="number"
                min={1}
                max={1000}
                defaultValue={settings.kapasitas_siswa}
                hint="Siswa baru ditolak bila kapasitas penuh."
              />
            </div>
            <h2>Presensi</h2>
            <div className="form-grid two">
              <Field
                label="Toleransi terlambat (menit)"
                name="toleransi_terlambat_menit"
                type="number"
                min={0}
                max={120}
                defaultValue={settings.toleransi_terlambat_menit}
                hint="Lewat dari jam mulai + toleransi dihitung terlambat."
              />
              <CheckField
                label="Hadir lewat QR langsung sah"
                name="presensi_qr_langsung_sah"
                defaultChecked={settings.presensi_qr_langsung_sah}
                hint="Bila dicentang, siswa yang memindai QR langsung tercatat hadir tanpa menunggu disahkan. Izin, sakit, dan pengajuan tanpa QR tetap menunggu pengesahan."
              />
            </div>
            <h2>Tes Samapta</h2>
            <p className="muted">Dipakai di blangko A4 dan klasifikasi hasil akhir.</p>
            <div className="form-grid two">
              <Field label="Kop blangko" name="samapta_kop" defaultValue={settings.samapta_kop} required />
              <Field label="Tempat tes bawaan" name="samapta_tempat" defaultValue={settings.samapta_tempat} hint="Boleh kosong. Bila diisi, dipakai di sesi tes baru dan blangko kosong." />
              <Field label="Kota penandatanganan" name="samapta_kota" defaultValue={settings.samapta_kota} required />
              <Field label="Jabatan penanda tangan" name="samapta_ttd_jabatan" defaultValue={settings.samapta_ttd_jabatan} required />
              <Field label="Nama penanda tangan" name="samapta_ttd_nama" defaultValue={settings.samapta_ttd_nama} required className="span-all" />
            </div>
            <h3>Batas klasifikasi hasil akhir (nilai minimal)</h3>
            <div className="form-grid three">
              <Field label="Baik Sekali" name="samapta_baik_sekali" type="number" min={1} max={100} defaultValue={settings.samapta_baik_sekali} />
              <Field label="Baik" name="samapta_baik" type="number" min={1} max={100} defaultValue={settings.samapta_baik} />
              <Field label="Cukup" name="samapta_cukup" type="number" min={1} max={100} defaultValue={settings.samapta_cukup} hint="Di bawah batas Cukup = Kurang." />
            </div>
            {FITUR.nilai ? (
              <>
                <h2>Predikat nilai (batas bawah, %)</h2>
                <div className="form-grid three">
                  <Field label="Predikat A" name="predikat_a" type="number" min={1} max={100} defaultValue={settings.predikat_a} />
                  <Field label="Predikat B" name="predikat_b" type="number" min={1} max={100} defaultValue={settings.predikat_b} />
                  <Field label="Predikat C" name="predikat_c" type="number" min={1} max={100} defaultValue={settings.predikat_c} />
                </div>
                <h2>Acuan nilai SKD</h2>
                <div className="form-grid three">
                  <Field label="TWK" name="acuan_twk" type="number" min={0} max={150} defaultValue={settings.acuan_twk} />
                  <Field label="TIU" name="acuan_tiu" type="number" min={0} max={175} defaultValue={settings.acuan_tiu} />
                  <Field label="TKP" name="acuan_tkp" type="number" min={0} max={225} defaultValue={settings.acuan_tkp} />
                </div>
              </>
            ) : (
              // Fitur nilai SKD disembunyikan: nilainya tetap dikirim agar tidak berubah.
              <>
                <input type="hidden" name="predikat_a" value={settings.predikat_a} />
                <input type="hidden" name="predikat_b" value={settings.predikat_b} />
                <input type="hidden" name="predikat_c" value={settings.predikat_c} />
                <input type="hidden" name="acuan_twk" value={settings.acuan_twk} />
                <input type="hidden" name="acuan_tiu" value={settings.acuan_tiu} />
                <input type="hidden" name="acuan_tkp" value={settings.acuan_tkp} />
              </>
            )}
          </fieldset>
          {editable ? (
            <div className="form-actions">
              <SubmitButton>Simpan pengaturan</SubmitButton>
            </div>
          ) : null}
        </ActionForm>
      </section>
    </div>
  );
}

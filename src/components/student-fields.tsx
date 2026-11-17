import { TARGETS, type Student } from "@/lib/core/types";
import { formatPhone } from "@/lib/format";
import { Field } from "./form";

/** Isian data siswa, dipakai untuk tambah dan ubah. */
export function StudentFields({ student, today }: { student?: Student; today: string }) {
  const phone = (value?: string) => (value ? formatPhone(value) : "");
  return (
    <div className="form-grid two">
      <Field label="Nama lengkap" name="nama" defaultValue={student?.nama} autoComplete="off" required className="span-all" />
      <Field
        label="Jenis kelamin"
        name="jenis_kelamin"
        type="select"
        defaultValue={student?.jenis_kelamin || "L"}
        options={[
          { value: "L", label: "Laki-laki" },
          { value: "P", label: "Perempuan" },
        ]}
        required
      />
      <Field
        label="Jalur target"
        name="jalur_target"
        type="select"
        defaultValue={student?.jalur_target || "TNI"}
        options={TARGETS.map((t) => ({ value: t, label: t }))}
        required
      />
      <Field label="Tempat lahir" name="tempat_lahir" defaultValue={student?.tempat_lahir} placeholder="mis. Gowa" />
      <Field label="Tanggal lahir" name="tanggal_lahir" type="date" defaultValue={student?.tanggal_lahir} />
      <Field label="Asal sekolah" name="asal_sekolah" defaultValue={student?.asal_sekolah} placeholder="mis. SMAN 1 Gowa" className="span-all" hint="Tampil di blangko Tes Samapta." />
      <Field label="Tanggal daftar" name="tanggal_daftar" type="date" defaultValue={student?.tanggal_daftar || today} />
      <Field label="No. WA siswa" name="no_wa" type="tel" inputMode="tel" defaultValue={phone(student?.no_wa)} placeholder="0812 3456 7890" />
      <Field label="Nama wali" name="nama_wali" defaultValue={student?.nama_wali} />
      <Field label="No. WA wali" name="no_wa_wali" type="tel" inputMode="tel" defaultValue={phone(student?.no_wa_wali)} placeholder="0812 3456 7890" />
      <Field label="Catatan" name="catatan" type="textarea" defaultValue={student?.catatan} className="span-all" hint="Opsional. Hanya terlihat oleh owner dan admin." />
    </div>
  );
}

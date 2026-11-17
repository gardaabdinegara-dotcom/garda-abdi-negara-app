import type { Assignment } from "@/lib/core/akademik";
import type { ClassGroup } from "@/lib/core/types";
import { typeOptions } from "./akademik";
import { CheckField, Field } from "./form";

/** Isian tugas untuk tambah dan ubah. */
export function TaskFields({ classes, allClasses, task, today }: { classes: ClassGroup[]; allClasses: boolean; task?: Assignment; today: string }) {
  const options = [...(allClasses ? [{ value: "", label: "Semua kelas" }] : []), ...classes.map((c) => ({ value: c.kelas_id, label: c.nama_kelas }))];
  return (
    <div className="form-grid two">
      <Field label="Nama tugas" name="nama" defaultValue={task?.nama} required className="span-all" />
      <Field label="Bidang" name="bidang" type="select" defaultValue={task?.bidang ?? "AKADEMIK"} options={typeOptions} />
      <Field label="Kelas" name="kelas_id" type="select" defaultValue={task?.kelas_id ?? options[0]?.value} options={options} />
      <Field label="Tenggat" name="tenggat" type="date" defaultValue={task?.tenggat ?? today} required />
      <Field label="Instruksi" name="instruksi" type="textarea" defaultValue={task?.instruksi} className="span-all" hint="Mis. kerjakan soal di Google Form lalu kirim tautan hasilnya." />
      {task ? <CheckField label="Tugas aktif" name="aktif" defaultChecked={task.aktif} hint="Tugas nonaktif disembunyikan dari siswa." /> : null}
    </div>
  );
}

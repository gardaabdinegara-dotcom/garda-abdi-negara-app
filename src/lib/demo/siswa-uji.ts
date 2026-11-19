import { hashPassword } from "../auth/password";
import { localClock } from "../core/akademik";
import type { User } from "../core/types";
import { buildDemoData } from "./data-contoh";

export const PIN_SISWA_UJI = "582946";
const ZONE = "Asia/Jakarta";

const owner: User = {
  user_id: "USR_PELATIH_UJI",
  username: "pelatih-uji",
  nama: "Pelatih Contoh",
  peran: "OWNER",
  password_hash: "",
  wajib_ganti_password: false,
  versi_otorisasi: 1,
  akses_keuangan: "TIDAK",
  aktif: true,
  terakhir_masuk: "",
  dihapus_pada: "",
};

const clockAt = (ms: number) => localClock(ZONE, new Date(ms).toISOString());
export const sesiQrSiswaUji = (ms: number) => `SES_UJI_QR_${clockAt(ms).date}`;
let initialPin: Promise<string> | undefined;

export async function buildSiswaUji(started: number) {
  const now = new Date(started).toISOString();
  const data = buildDemoData(owner, now);
  const { inti } = data;
  const student = inti.Siswa![0]!;
  const link = inti.Tautan_Akun!.find((row) => row.jenis === "SISWA" && row.siswa_id === student.siswa_id)!;
  const user = inti.Pengguna!.find((row) => row.user_id === link.user_id)!;
  student.nama = user.nama = "Siswa Uji";
  student.kode_siswa = "GAN-UJI";
  user.username = "siswa-uji";
  user.password_hash = await (initialPin ??= hashPassword(PIN_SISWA_UJI));

  const audit = { created_at: now, updated_at: now, created_by: owner.user_id, updated_by: owner.user_id };
  // Sesi yang masih tersedia jika masa uji melewati tengah malam WIB.
  for (const day of [started, started + 86_400_000]) {
    const { date, time } = clockAt(day);
    const session = {
      tanggal: date, jam_mulai: day === started ? time : "00:00", jam_selesai: "23:59", jenis: "AKADEMIK",
      kelas_id: "", pengajar_id: owner.user_id, status: "AKTIF", peserta_ids: String(student.siswa_id), ...audit,
    };
    inti.Sesi!.push(
      { ...session, sesi_id: `SES_UJI_MANDIRI_${date}`, nama: "Presensi mandiri (uji)" },
      { ...session, sesi_id: sesiQrSiswaUji(day), nama: "Presensi QR (uji)" },
    );
  }
  inti.Tugas!.push({
    tugas_id: "TGS_SISWA_UJI", nama: "Tugas contoh", bidang: "AKADEMIK", kelas_id: "",
    tenggat: clockAt(started + 86_400_000).date, instruksi: "Kirim tautan contoh hasil latihan.",
    pengajar_id: owner.user_id, aktif: true, ...audit,
  });
  return { data, userId: String(user.user_id) };
}

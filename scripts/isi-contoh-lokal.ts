// Mengisi data contoh untuk mode lokal (.data/lokal.json). Tidak pernah menyentuh Google Sheets.
//   npm run dev:contoh -- --ulang
// Semua akun contoh memakai satu password. Isi CONTOH_PASSWORD
// bila ingin menentukan sendiri; bila kosong, password acak dibuat dan ditampilkan sekali di layar.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { hashPassword, temporaryPassword } from "../src/lib/auth/password";
import { localDataFile } from "../src/lib/config";
import {
  addLink,
  createEnrollment,
  createStudent,
  createUser,
  saveClass,
  saveProgram,
  setStudentActive,
  updateEnrollmentStatus,
} from "../src/lib/core/domain";
import { toEnrollment, toStudent, toUser, type Actor, type Role } from "../src/lib/core/types";
import { passwordProblem, studentInput, type StudentInput } from "../src/lib/core/validation";
import { runOperation, type OperationContext } from "../src/lib/data/coordinator";
import { MemoryGate, MemoryLimiter } from "../src/lib/data/gate";
import { MemoryStore } from "../src/lib/data/memory-store";
import { str } from "../src/lib/data/rows";
import type { Row, Tables } from "../src/lib/data/types";
import { setupSheets } from "../src/lib/setup";
import { applyFinanceCommand, FINANCE_TABLES } from "../src/lib/keuangan/sumber";
import { eligibleStudents, isLate, localClock, publishReport, saveAssignment, saveHealth, saveReportNote, saveTest, toSession } from "../src/lib/core/akademik";
import { SAMAPTA_TABLES, saveSamaptaPos, saveSamaptaTest, setSamaptaStatus } from "../src/lib/core/samapta";
import { samaptaPosInput } from "../src/lib/core/samapta-input";
import { LATIHAN_TABLES } from "../src/lib/core/latihan-simpan";
import { isiContohLatihan, type PolaLatihan } from "../src/lib/demo/data-contoh";

const file = localDataFile();
if (fs.existsSync(file) && !process.argv.includes("--ulang")) {
  console.error(`File ${file} sudah ada. Jalankan dengan --ulang untuk menghapus dan mengisi ulang data contoh.`);
  process.exit(1);
}
fs.rmSync(file, { force: true });

const fromEnv = process.env.CONTOH_PASSWORD?.trim();
const password = fromEnv || temporaryPassword();
const problem = passwordProblem(password, "pemilik", true);
if (problem) {
  console.error(`CONTOH_PASSWORD tidak memenuhi syarat: ${problem}`);
  process.exit(1);
}

const deps = { store: new MemoryStore({ file }), gate: new MemoryGate(), limiter: new MemoryLimiter() };
await setupSheets(deps, true);

const passwordHash = await hashPassword(password);
const ALL = ["Pengaturan", "Pengguna", "Tautan_Akun", "Siswa", "Program", "Kelas", "Pendaftaran", "Sesi", "Presensi", "Hasil_Tes", "Tugas", "Pengumpulan", "Kesehatan", "Rapor"];

async function step(name: string, actorId: string, apply: (t: Tables, ctx: OperationContext) => void) {
  await runOperation(deps, {
    sheet: "inti",
    operationId: randomUUID(),
    actorId,
    action: `isiContoh:${name}`,
    fingerprint: { name },
    tables: ALL,
    apply: (t, ctx) => {
      apply(t, ctx);
      return { entityType: "Contoh", entityId: name, message: `Contoh ${name} diisi.` };
    },
  });
}

/** Akun contoh tidak perlu mengganti password agar bisa langsung dipakai. */
function readyToUse(t: Tables) {
  for (const row of t.Pengguna!) row.wajib_ganti_password = false;
}

// 1. Owner pertama.
await step("owner", "SISTEM", (t, ctx) => {
  createUser(t, { username: "pemilik", nama: "Pemilik Garda", peran: "OWNER", akses_keuangan: "TIDAK" }, passwordHash, ctx, null);
  readyToUse(t);
});

const snapshot = await deps.store.read("inti", ["Pengguna"]);
const ownerRow = snapshot.Pengguna!.find((row) => row.username === "pemilik")!;
const owner: Actor = { user: toUser(ownerRow), links: [] };
const ownerId = str(ownerRow.user_id);

const ids = {
  users: new Map<string, string>(),
  programs: new Map<string, string>(),
  classes: new Map<string, string>(),
  students: [] as string[],
};

// 2. Akun lain.
const ACCOUNTS: { username: string; nama: string; peran: Role; akses?: "LIHAT" }[] = [
  { username: "admin.rina", nama: "Rina Kartika", peran: "ADMIN", akses: "LIHAT" },
  { username: "pengajar.dimas", nama: "Dimas Hidayat", peran: "PENGAJAR" },
  { username: "siswa.arif", nama: "Arif Pratama", peran: "SISWA" },
  { username: "wali.sari", nama: "Sari Wulandari", peran: "WALI" },
];
await step("akun", ownerId, (t, ctx) => {
  for (const a of ACCOUNTS) {
    const out = createUser(t, { username: a.username, nama: a.nama, peran: a.peran, akses_keuangan: a.akses ?? "TIDAK" }, passwordHash, ctx, owner);
    ids.users.set(a.username, out.entityId);
  }
  readyToUse(t);
});

// 3. Program dan kelas.
await step("katalog", ownerId, (t, ctx) => {
  for (const [nama, target] of [
    ["Reguler TNI 2027", "TNI"],
    ["Reguler Polri 2027", "Polri"],
    ["Kedinasan 2027", "Kedinasan"],
  ] as const) {
    ids.programs.set(target, saveProgram(t, { program_id: "", nama_program: nama, target_seleksi: target, aktif: true }, ctx, owner).entityId);
  }
  for (const [nama, target] of [
    ["TNI A", "TNI"],
    ["TNI B", "TNI"],
    ["Polri A", "Polri"],
    ["Kedinasan A", "Kedinasan"],
  ] as const) {
    ids.classes.set(nama, saveClass(t, { kelas_id: "", nama_kelas: nama, program_id: ids.programs.get(target)!, angkatan: "2026", aktif: true }, ctx, owner).entityId);
  }
});

// 4. Siswa (nama dan nomor fiktif).
const STUDENTS: [string, "L" | "P", "TNI" | "Polri" | "Kedinasan", string, string][] = [
  ["Arif Pratama", "L", "TNI", "Sari Wulandari", "2026-07-06"],
  ["Nadia Pratama", "P", "Kedinasan", "Sari Wulandari", "2026-07-06"],
  ["Bagus Setiawan", "L", "TNI", "Hartono", "2026-07-08"],
  ["Dewi Lestari", "P", "Polri", "Sumarni", "2026-07-10"],
  ["Rizky Ramadhan", "L", "Polri", "Abdul Rahman", "2026-07-13"],
  ["Fajar Nugroho", "L", "TNI", "Bambang Nugroho", "2026-07-15"],
  ["Putri Anggraini", "P", "Kedinasan", "Yuliani", "2026-07-20"],
  ["Yoga Saputra", "L", "TNI", "Slamet Riyadi", "2026-08-03"],
  ["Intan Permata", "P", "Polri", "Rosita", "2026-08-05"],
  ["Hendra Wijaya", "L", "TNI", "Agus Wijaya", "2026-08-12"],
  ["Salsa Amelia", "P", "Kedinasan", "Nurhayati", "2026-09-01"],
  ["Galih Prakoso", "L", "Polri", "Joko Prakoso", "2026-07-01"],
];
await step("siswa", ownerId, (t, ctx) => {
  STUDENTS.forEach(([nama, jk, target, wali, tanggal], i) => {
    const input: StudentInput = studentInput.parse({
      nama,
      jenis_kelamin: jk,
      jalur_target: target,
      tanggal_lahir: `${2005 + (i % 4)}-0${(i % 9) + 1}-1${i % 9}`,
      no_wa: `0812000001${String(i).padStart(2, "0")}`,
      nama_wali: wali,
      no_wa_wali: `0813000002${String(i).padStart(2, "0")}`,
      tanggal_daftar: tanggal,
      tempat_lahir: ["Gowa", "Makassar", "Maros", "Takalar"][i % 4],
      asal_sekolah: ["SMAN 1 Gowa", "SMKN 2 Makassar", "MAN 1 Maros", "SMAN 3 Takalar"][i % 4],
      catatan: "",
    });
    ids.students.push(createStudent(t, input, ctx, owner).entityId);
  });
});

// 5. Pendaftaran, status, dan tautan akun.
await step("pendaftaran", ownerId, (t, ctx) => {
  const classFor = (target: string, i: number) =>
    target === "TNI" ? (i % 2 === 0 ? "TNI A" : "TNI B") : target === "Polri" ? "Polri A" : "Kedinasan A";
  const enrollmentIds: string[] = [];
  STUDENTS.forEach(([, , target, , tanggal], i) => {
    const out = createEnrollment(
      t,
      { siswa_id: ids.students[i]!, program_id: ids.programs.get(target)!, kelas_id: ids.classes.get(classFor(target, i))!, tanggal_mulai: tanggal },
      ctx,
      owner,
    );
    enrollmentIds.push(out.entityId);
  });
  updateEnrollmentStatus(t, { pendaftaran_id: enrollmentIds[9]!, status: "CUTI", tanggal_selesai: "" }, ctx, owner);
  updateEnrollmentStatus(t, { pendaftaran_id: enrollmentIds[11]!, status: "SELESAI", tanggal_selesai: "2026-10-31" }, ctx, owner);
  setStudentActive(t, ids.students[11]!, false, ctx, owner);

  addLink(t, { user_id: ids.users.get("pengajar.dimas")!, jenis: "PENGAJAR_KELAS", siswa_id: "", kelas_id: ids.classes.get("TNI A")! }, ctx, owner);
  addLink(t, { user_id: ids.users.get("pengajar.dimas")!, jenis: "PENGAJAR_KELAS", siswa_id: "", kelas_id: ids.classes.get("TNI B")! }, ctx, owner);
  addLink(t, { user_id: ids.users.get("siswa.arif")!, jenis: "SISWA", siswa_id: ids.students[0]!, kelas_id: "" }, ctx, owner);
  addLink(t, { user_id: ids.users.get("wali.sari")!, jenis: "WALI", siswa_id: ids.students[0]!, kelas_id: "" }, ctx, owner);
  addLink(t, { user_id: ids.users.get("wali.sari")!, jenis: "WALI", siswa_id: ids.students[1]!, kelas_id: "" }, ctx, owner);
});

// 6. Data akademik: sesi beberapa hari kerja terakhir, presensi, nilai, tugas, kesehatan, dan satu rapor terbit.
// Riwayat sesi diisi langsung sebagai data contoh; di aplikasi, status sesi hanya berubah lewat tombol pengajar.
let seed = 20261113;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const between = (min: number, max: number) => Math.round(min + random() * (max - min));
const clock = localClock("Asia/Jakarta", new Date().toISOString());
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const pastDays: string[] = [];
for (let back = 1; pastDays.length < 8; back += 1) {
  const day = shift(clock.date, -back);
  if (weekday(day) !== 0) pastDays.push(day);
}
const dimas = ids.users.get("pengajar.dimas")!;
const sessionPlan = [
  { kelas: "TNI A", nama: "Latihan SKD", jenis: "SKD", mulai: "07:00", selesai: "09:00", pengajar: dimas },
  { kelas: "TNI B", nama: "Penalaran numerik", jenis: "AKADEMIK", mulai: "09:30", selesai: "11:00", pengajar: dimas },
  { kelas: "Polri A", nama: "Latihan fisik", jenis: "FISIK", mulai: "15:30", selesai: "17:00", pengajar: ownerId },
  { kelas: "Kedinasan A", nama: "Psikotes", jenis: "PSIKOTES", mulai: "13:00", selesai: "14:30", pengajar: ownerId },
] as const;
const lowAttendance = ids.students[4]!; // Rizky Ramadhan: contoh kehadiran rendah

await step("akademik", ownerId, (t, ctx) => {
  const students = t.Siswa!.map(toStudent);
  const enrollments = t.Pendaftaran!.map(toEnrollment);
  const audit = { created_at: ctx.now, created_by: ctx.actorId, updated_at: ctx.now, updated_by: ctx.actorId };
  const addSession = (tanggal: string, plan: (typeof sessionPlan)[number], status: string, nama: string = plan.nama) => {
    const kelas_id = ids.classes.get(plan.kelas)!;
    const peserta = status === "AKAN_DATANG" ? [] : eligibleStudents({ kelas_id, tanggal }, students, enrollments);
    const row = {
      sesi_id: ctx.newId("SES"),
      nama,
      tanggal,
      jam_mulai: plan.mulai,
      jam_selesai: plan.selesai,
      jenis: plan.jenis,
      kelas_id,
      pengajar_id: plan.pengajar,
      status,
      peserta_ids: peserta.join(","),
      ...audit,
    };
    t.Sesi!.push(row);
    return toSession(row);
  };
  const mark = (sesi: ReturnType<typeof toSession>, siswaId: string, status: string, waktu: string, metode = "PENGAJAR", catatan = "") => {
    t.Presensi!.push({
      presensi_id: `${sesi.sesi_id}:${siswaId}`,
      sesi_id: sesi.sesi_id,
      siswa_id: siswaId,
      status,
      status_diajukan: metode === "PENGAJAR" ? "" : "HADIR",
      metode,
      waktu,
      terlambat: status !== "IZIN" && status !== "SAKIT" && isLate(waktu, sesi.jam_mulai, 10),
      catatan,
      disahkan_oleh: status === "MENUNGGU" ? "" : sesi.pengajar_id,
      disahkan_pada: status === "MENUNGGU" ? "" : ctx.now,
      ...audit,
    });
  };
  const minutesAfter = (time: string, minutes: number) => {
    const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + minutes;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  // Riwayat 8 hari kerja: sesi selesai dengan presensi bervariasi.
  for (const day of [...pastDays].reverse()) {
    for (const plan of sessionPlan) {
      const sesi = addSession(day, plan, "SELESAI");
      for (const siswaId of sesi.peserta_ids) {
        const r = random();
        const hadir = siswaId === lowAttendance ? r < 0.55 : r < 0.84;
        if (hadir) mark(sesi, siswaId, "HADIR", minutesAfter(plan.mulai, r < 0.1 ? between(12, 25) : between(-10, 8)), r < 0.5 ? "QR" : "PENGAJAR");
        else if (r < 0.9) mark(sesi, siswaId, "IZIN", plan.mulai, "PENGAJAR", "Keperluan keluarga");
        else if (r < 0.95) mark(sesi, siswaId, "SAKIT", plan.mulai, "PENGAJAR", "Demam");
        // selebihnya tanpa catatan sehingga dihitung alfa
      }
    }
  }
  // Hari ini: TNI A sedang berlangsung (ada pengajuan menunggu), TNI B belum dibuka; besok satu sesi.
  const live = addSession(clock.date, sessionPlan[0], "AKTIF", "Tryout SKD mingguan");
  live.peserta_ids.forEach((siswaId, i) => {
    if (siswaId === ids.students[0]) mark(live, siswaId, "MENUNGGU", minutesAfter(live.jam_mulai, 4), "QR");
    else if (i % 2 === 0) mark(live, siswaId, "HADIR", minutesAfter(live.jam_mulai, 2), "QR");
  });
  addSession(clock.date, sessionPlan[1], "AKAN_DATANG");
  addSession(shift(clock.date, 1), sessionPlan[3], "AKAN_DATANG");

  // Nilai, kesehatan bulan ini untuk siswa aktif.
  const monthStart = `${clock.date.slice(0, 8)}01`;
  const testDays = [pastDays[6] ?? monthStart, pastDays[1] ?? clock.date].map((d) => (d < monthStart ? monthStart : d));
  const base = { tes_id: "", komponen: "", nama_tes: "", twk: "", tiu: "", tkp: "", skor: "", hasil_mentah: "", protokol: "", catatan: "" };
  ids.students.slice(0, 11).forEach((siswaId, i) => {
    testDays.forEach((tanggal, n) => {
      saveTest(t, { ...base, siswa_id: siswaId, kategori: "SKD", nama_tes: `Tryout ${n + 1}`, tanggal, twk: String(between(55, 110)), tiu: String(between(70, 140)), tkp: String(between(140, 195)) }, ctx, owner);
    });
    for (const komponen of ["numerik", "indonesia", "inggris", "ipu"]) {
      saveTest(t, { ...base, siswa_id: siswaId, kategori: "AKADEMIK", komponen, tanggal: testDays[1]!, skor: String(between(50, 95)) }, ctx, owner);
    }
    if (i % 2 === 0) {
      for (const komponen of ["kecerdasan", "kecermatan", "kepribadian"]) {
        saveTest(t, { ...base, siswa_id: siswaId, kategori: "PSIKOTES", komponen, tanggal: testDays[0]!, skor: String(between(55, 92)) }, ctx, owner);
      }
    }
    saveTest(t, { ...base, siswa_id: siswaId, kategori: "FISIK", komponen: "lari", tanggal: testDays[0]!, skor: String(between(55, 90)), hasil_mentah: String(between(2200, 3100)), protokol: "Tes Cooper 12 menit" }, ctx, owner);
    saveTest(t, { ...base, siswa_id: siswaId, kategori: "FISIK", komponen: "pushup", tanggal: testDays[0]!, skor: String(between(50, 95)), hasil_mentah: String(between(18, 45)), protokol: "1 menit" }, ctx, owner);
    saveHealth(t, { siswa_id: siswaId, tanggal: testDays[0]!, tinggi_cm: String(between(158, 182)), berat_kg: String(between(50, 76)), sistolik: String(between(108, 126)), diastolik: String(between(68, 82)), catatan: i === 3 ? "Disarankan menambah asupan protein." : "" }, ctx, owner);
  });

  // Tugas dan pengumpulan.
  const tiu = saveAssignment(t, { tugas_id: "", nama: "Latihan TIU numerik 20 soal", bidang: "SKD", kelas_id: ids.classes.get("TNI A")!, tenggat: shift(clock.date, 3), instruksi: "Kerjakan paket latihan di Google Form, lalu kirim tautan hasilnya.", aktif: true }, ctx, owner).entityId;
  const esai = saveAssignment(t, { tugas_id: "", nama: "Esai wawasan kebangsaan", bidang: "AKADEMIK", kelas_id: "", tenggat: shift(clock.date, 7), instruksi: "Tulis 500 kata tentang bela negara di Google Docs dan bagikan tautannya.", aktif: true }, ctx, owner).entityId;
  t.Tugas!.forEach((row) => (row.pengajar_id = row.tugas_id === tiu ? dimas : ownerId));
  const tniA = new Set(enrollments.filter((e) => e.kelas_id === ids.classes.get("TNI A") && e.status === "AKTIF").map((e) => e.siswa_id));
  ids.students.slice(0, 11).forEach((siswaId, i) => {
    const push = (tugas: string, status: string, nilai: number | "") =>
      t.Pengumpulan!.push({ pengumpulan_id: `${tugas}:${siswaId}`, tugas_id: tugas, siswa_id: siswaId, tautan: `https://docs.google.com/document/d/contoh-${i}`, catatan: "", status, nilai, diperiksa_oleh: status === "DIKIRIM" ? "" : ownerId, ...audit });
    if (tniA.has(siswaId) && i !== 0) push(tiu, i % 4 === 0 ? "DIPERIKSA" : "DIKIRIM", i % 4 === 0 ? between(70, 95) : "");
    if (i % 3 === 1) push(esai, "DIPERIKSA", between(65, 92));
  });

  // Rapor: Nadia sudah terbit, Arif masih draf berisi catatan pengajar.
  saveReportNote(t, { siswa_id: ids.students[0]!, periode: clock.date.slice(0, 7), catatan: "Disiplin baik. Tingkatkan latihan TKP dan lari 12 menit." }, ctx, owner);
  publishReport(t, { siswa_id: ids.students[1]!, periode: clock.date.slice(0, 7), catatan: "Konsisten dan aktif bertanya. Pertahankan." }, ctx, owner);
});

// 6b. Tes Samapta: Tes I (selesai) dan Tes II (berjalan, beberapa pos belum lengkap). Nilai fiktif.
async function samapta(name: string, apply: (t: Tables, ctx: OperationContext) => void) {
  await runOperation(deps, {
    sheet: "inti",
    operationId: randomUUID(),
    actorId: ownerId,
    action: `isiContoh:${name}`,
    fingerprint: { name },
    tables: [...SAMAPTA_TABLES],
    apply: (t, ctx) => {
      apply(t, ctx);
      return { entityType: "Contoh", entityId: name, message: `Contoh ${name} diisi.` };
    },
  });
}
const samaptaDays = [shift(clock.date, -30), shift(clock.date, -2)];
for (const [n, tanggal] of samaptaDays.entries()) {
  await samapta(`samapta-${n + 1}`, (t, ctx) => {
    const tesId = saveSamaptaTest(t, { tes_id: "", nama: `Tes Samapta ${n === 0 ? "I" : "II"}`, tanggal, jam_mulai: "07:00", tempat: "", catatan: "" }, ctx, owner).entityId;
    const peserta = String(t.Tes_Samapta!.find((r) => r.tes_id === tesId)!.peserta_ids).split(",");
    peserta.forEach((siswaId, i) => {
      const put = (pos: string, values: Record<string, string>) => saveSamaptaPos(t, samaptaPosInput.parse({ tes_id: tesId, siswa_id: siswaId, pos, ...values }), ctx, owner);
      const naik = n * between(2, 8);
      const tinggi = between(160, 180);
      put("tensi", { tensi_1: `${between(110, 128)}/${between(70, 84)}`, tensi_2: `${between(110, 128)}/${between(70, 84)}`, tensi_3: `${between(110, 128)}/${between(70, 84)}`, riwayat_1: i === 2 ? "Cedera ringan pergelangan kaki" : "" });
      put("badan", { tinggi_cm: String(tinggi), berat_kg: String(Math.round(between(19, 24) * (tinggi / 100) ** 2)) });
      put("lari", { lari_jarak: String(between(2300, 3000)), lari_nilai: String(Math.min(100, between(55, 85) + naik)) });
      put("pull", { pull_jumlah: String(between(4, 15)), pull_nilai: String(Math.min(100, between(50, 85) + naik)) });
      put("situp", { situp_jumlah: String(between(28, 45)), situp_nilai: String(Math.min(100, between(55, 90) + naik)) });
      put("pushup", { pushup_jumlah: String(between(25, 45)), pushup_nilai: String(Math.min(100, between(55, 90) + naik)) });
      if (!(n === 1 && i === 4)) put("shuttle", { shuttle_waktu: (between(165, 195) / 10).toFixed(1), shuttle_nilai: String(Math.min(100, between(55, 88) + naik)) });
      if (!(n === 1 && i >= peserta.length - 2)) put("renang", { renang_gaya: ["Bebas", "Dada", "Punggung"][i % 3]!, renang_waktu: String(between(45, 95)) });
    });
    if (n === 0) setSamaptaStatus(t, { tes_id: tesId, status: "SELESAI" }, ctx, owner);
  });
}

// 6c. Latihan psikotes sekitar 3 minggu terakhir (fiktif), lewat perintah simpan yang sama dengan aplikasi.
// Ada siswa yang rutin dan naik, skornya turun, lama tidak latihan, baru mulai, dan belum pernah latihan,
// sehingga setiap tanda di rekap owner terlihat. Arif (akun siswa.arif) punya riwayat terpanjang.
const POLA_LOKAL: PolaLatihan[] = ["naik", "naik", "turun", "naik", "lama", "belum", "naik", "baru", "naik", "lama", "naik", "belum"];
await runOperation(deps, {
  sheet: "inti",
  operationId: randomUUID(),
  actorId: ownerId,
  action: "isiContoh:latihan",
  fingerprint: { name: "latihan" },
  tables: [...LATIHAN_TABLES, "Latihan_Psikotes"],
  apply: (t) => {
    const peserta = ids.students.map((siswaId, i) => ({
      siswaId,
      userId: i === 0 ? ids.users.get("siswa.arif")! : "CONTOH",
      pola: POLA_LOKAL[i] ?? "naik",
    }));
    const jumlah = isiContohLatihan(t, peserta, new Date().toISOString(), 20261117, (prefix) => `${prefix}_${randomUUID().replace(/-/g, "")}`);
    return { entityType: "Contoh", entityId: "latihan", message: `Contoh latihan diisi (${jumlah} latihan).` };
  },
});

// 7. Data keuangan: akun kas/bank, tarif, ketentuan biaya, tagihan, pembayaran, biaya, dan dasar laporan.
// Semua lewat perintah keuangan yang sama dengan aplikasi (aturan dan validasinya ikut berlaku).
const intiNow = await deps.store.read("inti", ["Pengaturan", "Pengguna", "Siswa", "Program", "Kelas", "Pendaftaran"]);
const fin = (action: string, data: Record<string, unknown>) =>
  runOperation(deps, {
    sheet: "keuangan",
    operationId: randomUUID(),
    actorId: ownerId,
    action,
    fingerprint: { action, data },
    tables: FINANCE_TABLES,
    apply: (t, ctx) => applyFinanceCommand(intiNow, t, { action, data }, ctx, owner),
  });
const month = clock.date.slice(0, 7);
const prevMonth = shift(`${month}-01`, -1).slice(0, 7);
const start = `${prevMonth}-01`;
const atMost = (date: string) => (date > clock.date ? clock.date : date);

await fin("finance.bootstrap", { tanggal_saldo_awal: start });
await fin("master.save", { table: "Akun", id: "AKN_cash", nama_akun: "Kas tunai", jenis_akun: "KAS", saldo_awal: 2000000, tanggal_saldo_awal: start, aktif: true });
await fin("master.save", { table: "Akun", id: "AKN_bank", nama_akun: "Rekening BRI", jenis_akun: "BANK", saldo_awal: 15000000, tanggal_saldo_awal: start, aktif: true });
const tariffs: Record<string, [string, number]> = { TNI: ["PAKET", 4500000], Polri: ["PAKET", 4200000], Kedinasan: ["BULANAN", 650000] };
for (const [target, [skema, tarif]] of Object.entries(tariffs)) {
  await fin("tariff.save", { program_id: ids.programs.get(target)!, skema_default: skema, tarif_default: tarif });
}
const enrollmentOf = new Map(intiNow.Pendaftaran!.filter((r) => r.status === "AKTIF" || r.status === "CUTI").map((r) => [String(r.siswa_id), r]));
const billable: { index: number; daf: string; target: string }[] = [];
for (const [index, [, , target]] of STUDENTS.entries()) {
  const enrollment = enrollmentOf.get(ids.students[index]!);
  if (!enrollment) continue;
  const [skema, tarif] = tariffs[target]!;
  // Nadia mendapat tarif khusus (hanya pemilik yang boleh menyetujui).
  await fin("fee.save", { pendaftaran_id: String(enrollment.pendaftaran_id), skema_biaya: skema, tarif_disepakati: index === 1 ? 600000 : tarif, hari_jatuh_tempo: 10 });
  if (enrollment.status === "AKTIF") billable.push({ index, daf: String(enrollment.pendaftaran_id), target });
}
const packages = billable.filter((b) => tariffs[b.target]![0] === "PAKET");
const monthly = billable.filter((b) => tariffs[b.target]![0] === "BULANAN");
for (const b of packages) {
  await fin("invoice.create", { pendaftaran_id: b.daf, tanggal_terbit: shift(start, 2), periode_layanan: "", diskon_awal: 0, cicilan: 3, jatuh_tempo_pertama: shift(start, 9) });
}
for (const [period, issued] of [[prevMonth, start], [month, `${month}-01`]] as const) {
  await fin("invoice.monthly", { periode_layanan: period, tanggal_terbit: atMost(issued), pendaftaran_ids: monthly.map((b) => b.daf) });
}
const bills = (await deps.store.read("keuangan", ["Tagihan", "Jadwal_Tagihan"])) as Tables;
const invoiceOf = (daf: string, period = "") => bills.Tagihan!.find((i) => i.pendaftaran_id === daf && String(i.periode_layanan) === period)!;
const pay = (invoice: Row, nominal: number, tanggal: string, akun: string, metode: string) =>
  fin("payment.create", { tagihan_id: String(invoice.tagihan_id), akun_id: akun, tanggal_transaksi: tanggal, nominal, metode_pembayaran: metode, deskripsi: "Pembayaran siswa", referensi_eksternal: "" });
for (const b of packages) {
  if (ids.students[b.index] === lowAttendance) continue; // contoh tunggakan
  const invoice = invoiceOf(b.daf);
  const stages = bills.Jadwal_Tagihan!.filter((j) => j.tagihan_id === invoice.tagihan_id).sort((x, y) => Number(x.urutan) - Number(y.urutan));
  const paidStages = b.index % 3 === 0 ? 2 : 1;
  for (const stage of stages.slice(0, paidStages)) {
    if (String(stage.jatuh_tempo) > clock.date) break;
    await pay(invoice, Number(stage.nominal), atMost(shift(String(stage.jatuh_tempo), -1)), b.index % 2 ? "AKN_bank" : "AKN_cash", b.index % 2 ? "Transfer" : "Tunai");
  }
}
for (const b of monthly) {
  const previous = invoiceOf(b.daf, prevMonth);
  await pay(previous, Number(previous.nominal_dasar), shift(start, 8), "AKN_bank", "Transfer");
  if (b.index === 1) {
    const current = invoiceOf(b.daf, month);
    await pay(current, Number(current.nominal_dasar), atMost(`${month}-05`), "AKN_bank", "QRIS");
  }
}
const cost = (tanggal: string, kategori: string, nominal: number, deskripsi: string, akun = "AKN_bank") =>
  fin("transaction.create", { jenis: "BIAYA", akun_id: akun, tanggal_transaksi: atMost(tanggal), nominal, kategori_id: kategori, deskripsi });
await cost(shift(start, 4), "KTG_sewa", 3000000, "Sewa ruang kelas");
await cost(shift(start, 27), "KTG_honor", 4200000, "Honor pengajar");
await cost(shift(start, 14), "KTG_operasional", 650000, "Alat tulis dan fotokopi modul", "AKN_cash");
await cost(`${month}-04`, "KTG_sewa", 3000000, "Sewa ruang kelas");
await cost(`${month}-06`, "KTG_operasional", 380000, "Air minum dan kebersihan", "AKN_cash");
await fin("transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: "AKN_cash", tanggal_transaksi: atMost(shift(start, 18)), nominal: 450000, kategori_id: "KTG_lain", deskripsi: "Penjualan buku latihan SKD" });
await fin("transfer.create", { dari_akun_id: "AKN_cash", ke_akun_id: "AKN_bank", tanggal_transaksi: atMost(shift(start, 20)), nominal: 2000000, deskripsi: "Setor tunai ke bank" });
await fin("report.profile", { tanggal_mulai: start, basis: "KAS_DISESUAIKAN", confirmed: true, dasar_pajak: "KAS_BRUTO", report_location: "Jakarta", report_signer: "Pemilik Garda", report_position: "Pemilik" });
await fin("report.mapping", {
  berlaku_mulai: start,
  mappings: [
    { kategori_id: "KTG_honor", kelompok: "GAJI" },
    { kategori_id: "KTG_operasional", kelompok: "BIAYA_LAIN" },
    { kategori_id: "KTG_sewa", kelompok: "SEWA" },
    { kategori_id: "KTG_lain", kelompok: "PENDAPATAN_LAIN" },
  ],
});
await fin("report.tax.rate", { berlaku_mulai: start, tarif_basis_poin: 50, catatan: "PPh final UMKM 0,5% atas omzet" });
await fin("report.opening", { verified: true, sumber: "Saldo kas dan bank awal pembukuan", balances: { MODAL: 17000000 } });

console.log(`\nData contoh tersimpan di ${file}`);
console.log("Akun: pemilik (Owner), admin.rina (Admin, keuangan: lihat), pengajar.dimas, siswa.arif, wali.sari");
if (fromEnv) {
  console.log("Password semua akun: nilai CONTOH_PASSWORD Anda.");
} else {
  console.log(`Password semua akun: ${password}`);
  console.log("Password ini hanya ditampilkan sekali dan hanya berlaku untuk data lokal.");
}
console.log("Jalankan: npm run dev  →  http://127.0.0.1:3020");

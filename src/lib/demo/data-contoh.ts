// Data contoh untuk MODE PRATINJAU (khusus owner/admin). Semuanya fiktif dan hanya hidup di memori server:
// tidak pernah ditulis ke Google Sheets. Dibuat dengan fungsi domain yang sama dengan aplikasi, jadi aturan,
// perhitungan, laporan, dan blangko berjalan persis seperti data asli.
import { localClock } from "../core/akademik";
import { createStudent } from "../core/domain";
import { createStudentAccount } from "../core/pin";
import { saveSamaptaPos, saveSamaptaTest, setSamaptaStatus } from "../core/samapta";
import { samaptaPosInput } from "../core/samapta-input";
import type { Actor, User } from "../core/types";
import { studentInput } from "../core/validation";
import type { OperationContext } from "../data/coordinator";
import { DEFAULT_FINANCE_SETTINGS, DEFAULT_SETTINGS, INTI, KEUANGAN } from "../data/schema";
import type { Row, Tables } from "../data/types";
import { applyFinanceCommand } from "../keuangan/sumber";

const NAMA: [string, "L" | "P"][] = [
  ["ARIF PRATAMA", "L"], ["BAGUS SETIAWAN", "L"], ["DIMAS ANGGARA", "L"], ["FAJAR NUGROHO", "L"], ["HENDRA WIJAYA", "L"],
  ["YOGA SAPUTRA", "L"], ["RIZKY RAMADHAN", "L"], ["GALIH PRAKOSO", "L"], ["ANDI KURNIAWAN", "L"], ["BAYU SAPUTRA", "L"],
  ["CANDRA WIBOWO", "L"], ["DEDI SETIADI", "L"], ["EKO PRASETYO", "L"], ["FIRMAN HIDAYAT", "L"], ["GILANG PERMANA", "L"],
  ["HADI SUSANTO", "L"], ["IRFAN MAULANA", "L"], ["JOKO SANTOSO", "L"], ["KEVIN ADITYA", "L"], ["LUTFI HAKIM", "L"],
  ["MUHAMMAD RAFI", "L"], ["NANDA PUTRI", "P"], ["OKTAVIA SARI", "P"], ["PUTRA PERDANA", "L"],
];
const KOTA = ["Gowa", "Makassar", "Maros", "Takalar", "Sungguminasa"];
const SEKOLAH = ["SMAN 1 Gowa", "SMKN 2 Makassar", "MAN 1 Maros", "SMAN 3 Takalar", "SMAN 11 Makassar"];

/** Pembangkit acak yang selalu sama untuk benih yang sama, agar data contoh identik di setiap server. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const wib = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();

function emptyTables(): { inti: Tables; keuangan: Tables } {
  const stamp = { updated_at: "", updated_by: "SISTEM" };
  const inti: Tables = Object.fromEntries(Object.values(INTI).map((def) => [def.name, [] as Row[]]));
  const keuangan: Tables = Object.fromEntries(Object.values(KEUANGAN).map((def) => [def.name, [] as Row[]]));
  inti.Pengaturan = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value, ...stamp }));
  keuangan.Pengaturan_Keuangan = Object.entries(DEFAULT_FINANCE_SETTINGS).map(([key, value]) => ({ key, value, ...stamp }));
  return { inti, keuangan };
}

/**
 * Membangun seluruh data contoh relatif terhadap hari ini: 24 siswa, presensi dua minggu terakhir (termasuk sesi
 * yang sedang berlangsung dengan pengajuan menunggu), Tes Samapta I (selesai) dan II (berjalan), serta
 * pemasukan/pengeluaran dua bulan dengan laporan siap diperiksa.
 */
export function buildDemoData(viewer: User, nowIso = new Date().toISOString()): { inti: Tables; keuangan: Tables } {
  const { inti, keuangan } = emptyTables();
  const today = localClock("Asia/Jakarta", nowIso).date;
  const rand = mulberry32(Number(today.replace(/-/g, "")));
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  let seq = 0;
  const ctxAt = (date: string, time = "08:00"): OperationContext => ({
    actorId: viewer.user_id,
    now: wib(date, time),
    operationId: `demo-op-${++seq}`,
    newId: (prefix) => `${prefix}_DEMO${String(++seq).padStart(5, "0")}`,
  });
  // Pemilik data contoh = pengguna yang membuka pratinjau (tanpa password; login tetap memakai akun asli).
  inti.Pengguna!.push({ ...(viewer as unknown as Row), password_hash: "", created_at: nowIso, created_by: "SISTEM", updated_at: nowIso, updated_by: "SISTEM" });
  const actor: Actor = { user: { ...viewer, peran: "OWNER" }, links: [] };
  const audit = (date: string) => ({ created_at: wib(date, "08:00"), created_by: viewer.user_id, updated_at: wib(date, "08:00"), updated_by: viewer.user_id });

  // ---------------------------------------------------------------- Siswa & akun
  const daftar = addDays(today, -75);
  const ids: string[] = [];
  NAMA.forEach(([nama, jk], i) => {
    const input = studentInput.parse({
      nama,
      jenis_kelamin: jk,
      jalur_target: "TNI",
      tanggal_lahir: `${2006 + (i % 3)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
      tempat_lahir: KOTA[i % KOTA.length],
      asal_sekolah: SEKOLAH[i % SEKOLAH.length],
      no_wa: `0812000${String(1000 + i)}`,
      tanggal_daftar: daftar,
    });
    const siswaId = createStudent(inti, input, ctxAt(daftar), actor).entityId;
    ids.push(siswaId);
    const account = createStudentAccount(inti, siswaId, ctxAt(daftar), actor);
    // Sebagian besar siswa sudah membuat PIN (hash contoh yang tidak bisa dipakai masuk).
    if (i % 6 !== 5) {
      const row = inti.Pengguna!.find((u) => u.user_id === account.entityId);
      if (row) row.password_hash = "pratinjau";
    }
  });
  const rajin = ids.map(() => 0.72 + rand() * 0.26);

  // ---------------------------------------------------------------- Presensi
  const peserta = ids.join(",");
  const sesi = (tanggal: string, nama: string, jenis: string, mulai: string, selesai: string, status: string): string => {
    const sesiId = `SES_DEMO_${tanggal.replace(/-/g, "")}_${mulai.replace(":", "")}`;
    inti.Sesi!.push({ sesi_id: sesiId, nama, tanggal, jam_mulai: mulai, jam_selesai: selesai, jenis, kelas_id: "", pengajar_id: viewer.user_id, status, peserta_ids: status === "AKAN_DATANG" ? "" : peserta, ...audit(tanggal) });
    return sesiId;
  };
  const hadir = (sesiId: string, tanggal: string, mulai: string, siswaId: string, i: number, mode: "selesai" | "berjalan") => {
    const r = rand();
    if (mode === "berjalan" && i >= 17) {
      if (i < 20) inti.Presensi!.push({ presensi_id: `${sesiId}:${siswaId}`, sesi_id: sesiId, siswa_id: siswaId, status: "MENUNGGU", status_diajukan: "HADIR", metode: "QR", waktu: mulai, terlambat: false, catatan: "", disahkan_oleh: "", disahkan_pada: "", ...audit(tanggal) });
      return;
    }
    if (r > rajin[i]!) {
      const jenis = r > 0.97 ? "SAKIT" : r > 0.93 ? "IZIN" : null;
      if (jenis) inti.Presensi!.push({ presensi_id: `${sesiId}:${siswaId}`, sesi_id: sesiId, siswa_id: siswaId, status: jenis, status_diajukan: jenis, metode: "MANDIRI", waktu: mulai, terlambat: false, catatan: jenis === "SAKIT" ? "Demam" : "Acara keluarga", disahkan_oleh: viewer.user_id, disahkan_pada: wib(tanggal, mulai), ...audit(tanggal) });
      return; // tanpa catatan = alfa saat sesi selesai
    }
    const telat = rand() < 0.08;
    inti.Presensi!.push({ presensi_id: `${sesiId}:${siswaId}`, sesi_id: sesiId, siswa_id: siswaId, status: "HADIR", status_diajukan: "HADIR", metode: "QR", waktu: telat ? `${mulai.slice(0, 3)}${String(Number(mulai.slice(3)) + 15).padStart(2, "0")}` : mulai, terlambat: telat, catatan: "", disahkan_oleh: "QR", disahkan_pada: wib(tanggal, mulai), ...audit(tanggal) });
  };
  for (let d = -16; d <= 0; d++) {
    const tanggal = addDays(today, d);
    if (weekday(tanggal) === 0 || weekday(tanggal) === 6) continue;
    const pagi = sesi(tanggal, "Latihan jasmani", "FISIK", "06:00", "08:00", "SELESAI");
    ids.forEach((id, i) => hadir(pagi, tanggal, "06:00", id, i, "selesai"));
    const status = d === 0 ? "AKTIF" : "SELESAI";
    const sore = sesi(tanggal, "Kelas akademik & SKD", "AKADEMIK", "15:30", "17:00", status);
    ids.forEach((id, i) => hadir(sore, tanggal, "15:30", id, i, d === 0 ? "berjalan" : "selesai"));
  }
  for (let d = 1, n = 0; n < 3; d++) {
    const tanggal = addDays(today, d);
    if (weekday(tanggal) === 0 || weekday(tanggal) === 6) continue;
    sesi(tanggal, n % 2 ? "Psikotes kecermatan" : "Latihan jasmani", n % 2 ? "PSIKOTES" : "FISIK", n % 2 ? "15:30" : "06:00", n % 2 ? "17:00" : "08:00", "AKAN_DATANG");
    n++;
  }

  // ---------------------------------------------------------------- Tes Samapta
  [addDays(today, -30), addDays(today, -2)].forEach((tanggal, n) => {
    const ctx = ctxAt(tanggal, "07:00");
    const tesId = saveSamaptaTest(inti, { tes_id: "", nama: `Tes Samapta ${n === 0 ? "I" : "II"}`, tanggal, jam_mulai: "07:00", tempat: "", catatan: "" }, ctx, actor).entityId;
    ids.forEach((siswaId, i) => {
      const put = (pos: string, values: Record<string, string>) => saveSamaptaPos(inti, samaptaPosInput.parse({ tes_id: tesId, siswa_id: siswaId, pos, ...values }), ctxAt(tanggal, "09:00"), actor);
      const naik = n * between(2, 9);
      const f = rajin[i]!;
      const tinggi = NAMA[i]![1] === "P" ? between(155, 166) : between(162, 180);
      const nilai = (lo: number, hi: number) => String(Math.min(100, Math.round(lo + f * (hi - lo) + between(-6, 6) + naik)));
      put("tensi", { tensi_1: `${between(110, 128)}/${between(70, 84)}`, tensi_2: `${between(110, 128)}/${between(70, 84)}`, tensi_3: `${between(110, 128)}/${between(70, 84)}`, riwayat_1: i === 4 ? "Cedera ringan pergelangan kaki" : "" });
      put("badan", { tinggi_cm: String(tinggi), berat_kg: String(Math.round(between(19, 24) * (tinggi / 100) ** 2)) });
      put("lari", { lari_jarak: String(Math.round((2100 + f * 900 + between(-60, 60) + naik * 20) / 10) * 10), lari_nilai: nilai(35, 92) });
      put("pull", { pull_jumlah: String(between(4, 15)), pull_nilai: nilai(40, 90) });
      put("situp", { situp_jumlah: String(between(28, 45)), situp_nilai: nilai(45, 95) });
      put("pushup", { pushup_jumlah: String(between(25, 45)), pushup_nilai: nilai(45, 95) });
      if (!(n === 1 && i === 6)) put("shuttle", { shuttle_waktu: (between(165, 195) / 10).toFixed(1), shuttle_nilai: nilai(40, 90) });
      if (!(n === 1 && i >= ids.length - 3)) put("renang", { renang_gaya: ["Bebas", "Dada", "Punggung"][i % 3]!, renang_waktu: String(between(45, 95)) });
    });
    if (n === 0) setSamaptaStatus(inti, { tes_id: tesId, status: "SELESAI" }, ctx, actor);
  });

  // ---------------------------------------------------------------- Keuangan (catat manual)
  const start = `${addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
  const fin = (action: string, data: Record<string, unknown>) => applyFinanceCommand(inti, keuangan, { action, data }, ctxAt(today, "12:00"), actor);
  fin("finance.bootstrap", { tanggal_saldo_awal: start });
  fin("master.save", { table: "Akun", id: "AKN_cash", nama_akun: "Kas tunai", jenis_akun: "KAS", saldo_awal: 2000000, tanggal_saldo_awal: start, aktif: true });
  fin("master.save", { table: "Akun", id: "AKN_bank", nama_akun: "Rekening BRI", jenis_akun: "BANK", saldo_awal: 10000000, tanggal_saldo_awal: start, aktif: true });
  fin("report.opening", { verified: true, sumber: "Saldo awal kas dan bank (data contoh)", balances: { MODAL: 12000000 } });
  const day = (month: string, d: number) => {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    return date > today ? null : date;
  };
  const prev = start.slice(0, 7), cur = today.slice(0, 7);
  const masuk = (tanggal: string | null, kategori: string, nominal: number, deskripsi: string, akun: string) => {
    if (tanggal) fin("transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: akun, kategori_id: kategori, nominal, tanggal_transaksi: tanggal, deskripsi });
  };
  const keluar = (tanggal: string | null, kategori: string, nominal: number, deskripsi: string, akun = "AKN_bank") => {
    if (tanggal) fin("transaction.create", { jenis: "BIAYA", akun_id: akun, kategori_id: kategori, nominal, tanggal_transaksi: tanggal, deskripsi });
  };
  NAMA.forEach(([nama], i) => {
    const kode = `GAN-${String(i + 1).padStart(4, "0")}`;
    const akun = i % 2 ? "AKN_bank" : "AKN_cash";
    masuk(day(prev, 3 + (i % 8)), "KTG_pendaftaran", 250000, `Formulir pendaftaran - ${kode} ${nama}`, akun);
    masuk(day(prev, 5 + (i % 8)), "KTG_bimbel", 1500000, `Cicilan 1 - ${kode} ${nama}`, akun);
    if (i % 4 !== 3) masuk(day(cur, 5 + (i % 9)), "KTG_bimbel", 1500000, `Cicilan 2 - ${kode} ${nama}`, akun);
  });
  for (const month of [prev, cur]) {
    keluar(day(month, 2), "KTG_sewa", 1200000, "Sewa lapangan latihan");
    keluar(day(month, 4), "KTG_atk", 375000, "Cetak blangko dan modul", "AKN_cash");
    keluar(day(month, 9), "KTG_utilitas", 350000, "Internet dan pulsa");
    keluar(day(month, 12), "KTG_konsumsi", 540000, "Air minum dan konsumsi latihan", "AKN_cash");
    keluar(day(month, 15), "KTG_operasional", 420000, "Perlengkapan latihan (cone, stopwatch)");
    keluar(day(month, 25), "KTG_honor", 4500000, "Honor pelatih dan pengajar");
  }
  keluar(day(prev, 18), "KTG_promosi", 300000, "Iklan media sosial");
  const setor = day(prev, 20);
  if (setor) fin("transfer.create", { dari_akun_id: "AKN_cash", ke_akun_id: "AKN_bank", tanggal_transaksi: setor, nominal: 5000000, deskripsi: "Setor tunai ke bank" });

  return { inti, keuangan };
}

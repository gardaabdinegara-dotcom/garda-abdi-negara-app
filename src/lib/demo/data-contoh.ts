// Data contoh untuk MODE PRATINJAU (khusus owner/admin). Semuanya fiktif dan hanya hidup di memori server:
// tidak pernah ditulis ke Google Sheets. Dibuat dengan fungsi domain yang sama dengan aplikasi, jadi aturan,
// perhitungan, laporan, dan blangko berjalan persis seperti data asli.
import { localClock } from "../core/akademik";
import { createStudent } from "../core/domain";
import { hitungHasil, JENIS_LATIHAN, PRESET, type Bagian, type DurasiLatihan, type JenisLatihan } from "../core/latihan";
import { saveLatihan } from "../core/latihan-simpan";
import { pengumumanInput, simpanPengumuman } from "../core/pengumuman";
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
/** Wali fiktif. Dua siswa sengaja tanpa nomor wali agar tombol "Isi nomor wali" ikut terlihat. */
const WALI = ["Ibu Rahmawati", "Bapak Syamsul", "Ibu Nurhayati", "Bapak Ridwan", "Ibu Hasnah", "Bapak Abdul Rahman", "Ibu Marlina", "Bapak Junaedi"];
const TANPA_WALI = new Set([5, 17]);
/** Jalur contoh: sebagian besar TNI, beberapa Polri dan satu Kedinasan (untuk chip saring di daftar siswa). */
const jalurContoh = (i: number) => (i === 13 ? "Kedinasan" : i % 5 === 1 ? "Polri" : "TNI");

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

// ---------------------------------------------------------------- Latihan psikotes contoh

/**
 * Pola riwayat latihan satu siswa:
 * "naik" = rutin dan makin baik, "turun" = rutin tetapi latihan terakhir turun 5 poin atau lebih,
 * "lama" = sempat latihan lalu berhenti 8 sampai 12 hari, "baru" = baru mulai minggu ini, "belum" = belum pernah.
 */
export type PolaLatihan = "naik" | "turun" | "lama" | "baru" | "belum";

export interface PesertaLatihan {
  siswaId: string;
  /** Akun siswa (untuk kolom created_by). */
  userId: string;
  pola: PolaLatihan;
}

/** Jawaban per kolom/interval untuk kemampuan `k` (0 sampai 1): makin tinggi makin cepat, teliti, dan stabil. */
function seriContoh(jenis: JenisLatihan, durasi: DurasiLatihan, k: number, rand: () => number): Bagian[] {
  const { bagian, detik } = PRESET[jenis][durasi];
  const cermat = jenis === "angka" || jenis === "simbol";
  const perMenit = cermat ? 12 + 30 * k : 14 + 36 * k;
  const teliti = Math.min(0.995, (cermat ? 0.82 + 0.16 * k : 0.88 + 0.11 * k) + (rand() - 0.5) * 0.02);
  const lelah = -0.18 * (1 - k) + (rand() - 0.5) * 0.1; // perubahan laju dari awal ke akhir
  const goyang = 0.04 + 0.16 * (1 - k);
  return Array.from({ length: bagian }, (_, b) => {
    const posisi = bagian > 1 ? b / (bagian - 1) - 0.5 : 0;
    const jawab = Math.min(400, Math.max(1, Math.round(((perMenit * detik) / 60) * (1 + lelah * posisi + (rand() - 0.5) * 2 * goyang))));
    const salah = Math.max(0, Math.round(jawab * (1 - teliti) + (rand() - 0.5) * 1.2));
    return { benar: Math.max(0, jawab - salah), jawab };
  });
}

/**
 * Mengisi riwayat latihan psikotes contoh sekitar 3 minggu terakhir lewat perintah simpan yang sama dengan aplikasi
 * (skor dihitung ulang dari data per kolom). Deterministik untuk benih dan waktu yang sama. Mengembalikan jumlah baris.
 */
export function isiContohLatihan(t: Tables, peserta: readonly PesertaLatihan[], nowIso: string, seed: number, newId: (prefix: string) => string): number {
  const rand = mulberry32(seed);
  const today = localClock("Asia/Jakarta", nowIso).date;
  const nowMs = Date.parse(nowIso);
  const jepit = (v: number) => Math.max(0.02, Math.min(0.98, v));
  let jumlahBaris = 0;
  let op = 0;

  peserta.forEach((p, idx) => {
    if (p.pola === "belum") return;
    const actor: Actor = {
      user: { user_id: p.userId, username: "", nama: "", peran: "SISWA", password_hash: "", wajib_ganti_password: false, versi_otorisasi: 1, akses_keuangan: "TIDAK", aktif: true, terakhir_masuk: "", dihapus_pada: "" },
      links: [{ tautan_id: "", user_id: p.userId, jenis: "SISWA", siswa_id: p.siswaId, kelas_id: "", aktif: true }],
    };
    const favorit = JENIS_LATIHAN[idx % JENIS_LATIHAN.length]!;
    const awal = 0.12 + rand() * 0.4;
    const naik = p.pola === "baru" ? 0.04 : 0.14 + rand() * 0.22;
    const [jumlah, pertama, terakhir] =
      p.pola === "lama"
        ? [3 + Math.floor(rand() * 4), -20 + Math.floor(rand() * 3), -(8 + Math.floor(rand() * 5))]
        : p.pola === "baru"
          ? [1 + Math.floor(rand() * 2), -4, -Math.floor(rand() * 2)]
          : p.pola === "turun"
            ? [6 + Math.floor(rand() * 5), -20 + Math.floor(rand() * 3), -(1 + Math.floor(rand() * 4))]
            : [idx === 0 ? 14 : 7 + Math.floor(rand() * 8), -20 + Math.floor(rand() * 4), -Math.floor(rand() * 3)];
    // Waktu mulai tiap latihan (jam 06.00 sampai 20.59 WIB), diurutkan dulu agar "latihan terakhir" di sini sama
    // dengan yang dibaca aplikasi. Latihan yang baru selesai setelah waktu sekarang digeser ke hari sebelumnya.
    const waktu = Array.from({ length: jumlah }, (_, k) => {
      let d = terakhir;
      if (k === 0 && jumlah > 1) d = pertama;
      else if (k < jumlah - 1) d = Math.max(pertama, Math.min(terakhir, Math.round(pertama + ((terakhir - pertama) * k) / (jumlah - 1) + (rand() - 0.5) * 1.6)));
      const jam = `${String(6 + Math.floor(rand() * 15)).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
      let ms = Date.parse(wib(addDays(today, d), jam));
      if (ms + 30 * 60_000 > nowMs) ms -= 86_400_000;
      return ms;
    }).sort((a, b) => a - b);
    for (let i = 1; i < waktu.length; i++) if (waktu[i]! - waktu[i - 1]! < 30 * 60_000) waktu[i] = waktu[i - 1]! + 30 * 60_000;

    const skorTerakhir = new Map<JenisLatihan, { skor: number; k: number }>();
    waktu.forEach((mulaiMs, n) => {
      const akhir = n === jumlah - 1;
      // Latihan pertama dan terakhir memakai jenis favorit agar tren jenis itu terbaca.
      const jenis = n === 0 || akhir || rand() < 0.55 ? favorit : JENIS_LATIHAN[Math.floor(rand() * JENIS_LATIHAN.length)]!;
      const r = rand();
      const durasi: DurasiLatihan = r < 0.45 ? "singkat" : r < 0.92 || jenis === "pauli" ? "standar" : "asli";
      const { bagian, detik } = PRESET[jenis][durasi];
      const lama = bagian * detik;
      let k = jepit(awal + naik * (jumlah > 1 ? n / (jumlah - 1) : 0) + (rand() - 0.5) * 0.08);
      const lalu = skorTerakhir.get(jenis);
      if (akhir && lalu && p.pola === "turun") k = jepit(lalu.k - 0.25 - rand() * 0.1);
      let seri = seriContoh(jenis, durasi, k, rand);
      // Pastikan tanda di rekap sesuai pola: "turun" turun 5 poin atau lebih, pola lain tidak turun sebanyak itu.
      for (let coba = 0; akhir && lalu && coba < 12; coba++) {
        const skor = hitungHasil(jenis, seri, lama).skor;
        if (p.pola === "turun" ? skor - lalu.skor <= -5 : skor - lalu.skor > -3) break;
        k = jepit(k + (p.pola === "turun" ? -0.06 : 0.05));
        seri = seriContoh(jenis, durasi, k, rand);
      }
      skorTerakhir.set(jenis, { skor: hitungHasil(jenis, seri, lama).skor, k });

      const ctx: OperationContext = {
        actorId: p.userId,
        now: new Date(mulaiMs + lama * 1000).toISOString(),
        operationId: `demo-lat-${++op}`,
        newId,
      };
      saveLatihan(t, { jenis, durasi, mulai: new Date(mulaiMs).toISOString(), detik: lama, seri }, ctx, actor);
      jumlahBaris++;
    });
  });
  return jumlahBaris;
}

/** Pola latihan 24 siswa contoh: kebanyakan naik, sisanya contoh untuk setiap tanda di rekap owner. */
const POLA_LATIHAN: Record<number, PolaLatihan> = { 3: "lama", 4: "turun", 6: "baru", 7: "belum", 11: "lama", 16: "baru", 18: "lama", 20: "turun", 23: "belum" };

/**
 * Membangun seluruh data contoh relatif terhadap hari ini: 24 siswa, presensi dua minggu terakhir (termasuk sesi
 * yang sedang berlangsung dengan pengajuan menunggu), Tes Samapta I (selesai) dan II (berjalan), latihan psikotes
 * tiga minggu terakhir, serta pemasukan/pengeluaran dua bulan dengan laporan siap diperiksa.
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
  const akun: string[] = [];
  NAMA.forEach(([nama, jk], i) => {
    const input = studentInput.parse({
      nama,
      jenis_kelamin: jk,
      jalur_target: jalurContoh(i),
      tanggal_lahir: `${2006 + (i % 3)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
      tempat_lahir: KOTA[i % KOTA.length],
      asal_sekolah: SEKOLAH[i % SEKOLAH.length],
      no_wa: `0812000${String(1000 + i)}`,
      nama_wali: TANPA_WALI.has(i) ? "" : WALI[i % WALI.length],
      no_wa_wali: TANPA_WALI.has(i) ? "" : `08134455${String(2100 + i * 7)}`,
      tanggal_daftar: daftar,
    });
    const siswaId = createStudent(inti, input, ctxAt(daftar), actor).entityId;
    ids.push(siswaId);
    const account = createStudentAccount(inti, siswaId, ctxAt(daftar), actor);
    akun.push(account.entityId);
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
      const putri = NAMA[i]![1] === "P";
      const tinggi = putri ? between(155, 166) : between(162, 180);
      const jarak = (putri ? 1650 + f * 800 : 2100 + f * 900) + between(-60, 60) + naik * 20;
      put("tensi", { tensi_1: `${between(110, 128)}/${between(70, 84)}`, tensi_2: `${between(110, 128)}/${between(70, 84)}`, tensi_3: `${between(110, 128)}/${between(70, 84)}`, riwayat_1: i === 4 ? "Cedera ringan pergelangan kaki" : "" });
      put("badan", { tinggi_cm: String(tinggi), berat_kg: String(Math.round(between(19, 24) * (tinggi / 100) ** 2)) });
      put("lari", { lari_jarak: String(Math.round(jarak / 10) * 10) });
      put("pull", { pull_jumlah: String(putri ? between(29, 61) : between(4, 15)) });
      put("situp", { situp_jumlah: String(between(28, 42)) });
      put("pushup", { pushup_jumlah: String(putri ? between(14, 28) : between(25, 43)) });
      if (!(n === 1 && i === 6)) put("shuttle", { shuttle_waktu: ((putri ? between(174, 209) : between(165, 195)) / 10).toFixed(1) });
      if (!(n === 1 && i >= ids.length - 3)) put("renang", { renang_gaya: ["Bebas", "Dada", "Punggung"][i % 3]!, renang_waktu: String(between(45, 95)) });
    });
    if (n === 0) setSamaptaStatus(inti, { tes_id: tesId, status: "SELESAI" }, ctx, actor);
  });

  // ---------------------------------------------------------------- Pengumuman (3 tampil, 1 sudah lewat)
  const hariTanggal = (date: string) =>
    new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));
  let minggu = addDays(today, 4);
  while (weekday(minggu) !== 0) minggu = addDays(minggu, 1);
  let senin = addDays(today, 1);
  while (weekday(senin) !== 1) senin = addDays(senin, 1);
  const cicilan = addDays(today, 15);
  const umumkan = (dibuat: string, jam: string, isi: { judul: string; isi: string; tampil_sampai: string; disematkan?: boolean }) =>
    simpanPengumuman(inti, pengumumanInput.parse({ disematkan: false, ...isi }), dibuat, ctxAt(dibuat, jam), actor);
  umumkan(addDays(today, -12), "19:00", { judul: "Pakaian latihan baru", isi: "Mulai pekan ini latihan pagi memakai kaus hijau Garda dan celana training hitam.", tampil_sampai: addDays(today, -5) });
  umumkan(addDays(today, -4), "20:15", { judul: `Cicilan 3 paling lambat ${hariTanggal(cicilan)}`, isi: "Bayar di kas atau transfer ke rekening BRI lembaga. Simpan bukti transfer dan tunjukkan ke admin.", tampil_sampai: cicilan });
  umumkan(addDays(today, -2), "18:30", { judul: `Libur sesi ${hariTanggal(senin)}`, isi: "Sesi hari itu dipindah ke hari berikutnya, jam dan tempat sama.", tampil_sampai: senin });
  umumkan(addDays(today, -1), "19:45", {
    judul: "Tes Samapta III",
    isi: `${hariTanggal(minggu)} 06.00 di Lap. Syekh Yusuf. Bawa sepatu lari dan air minum.`,
    tampil_sampai: minggu,
    disematkan: true,
  });

  // ---------------------------------------------------------------- Latihan psikotes
  isiContohLatihan(
    inti,
    ids.map((siswaId, i) => ({ siswaId, userId: akun[i]!, pola: POLA_LATIHAN[i] ?? "naik" })),
    nowIso,
    Number(today.replace(/-/g, "")) + 7,
    (prefix) => `${prefix}_DEMO${String(++seq).padStart(5, "0")}`,
  );

  // ---------------------------------------------------------------- Target latihan mingguan (contoh)
  inti.Pengaturan!.push({ key: "latihan_target", value: JSON.stringify({ jenis: "kraepelin", durasi: "standar", kali: 3 }), updated_at: wib(today, "07:00"), updated_by: actor.user.user_id });

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
  const masuk = (tanggal: string | null, kategori: string, nominal: number, deskripsi: string, akun: string, siswaId = "") => {
    if (tanggal) fin("transaction.create", { jenis: "PENERIMAAN_LAIN", akun_id: akun, kategori_id: kategori, nominal, tanggal_transaksi: tanggal, deskripsi, ...(siswaId ? { siswa_id: siswaId } : {}) });
  };
  const keluar = (tanggal: string | null, kategori: string, nominal: number, deskripsi: string, akun = "AKN_bank") => {
    if (tanggal) fin("transaction.create", { jenis: "BIAYA", akun_id: akun, kategori_id: kategori, nominal, tanggal_transaksi: tanggal, deskripsi });
  };
  NAMA.forEach(([nama], i) => {
    const kode = `GAN-${String(i + 1).padStart(4, "0")}`;
    const akun = i % 2 ? "AKN_bank" : "AKN_cash";
    // Uang masuk dari siswa ditautkan ke siswanya agar profil siswa menampilkan riwayat bayar (bukan tagihan).
    const siswaId = ids[i] ?? "";
    masuk(day(prev, 3 + (i % 8)), "KTG_pendaftaran", 250000, `Formulir pendaftaran - ${kode} ${nama}`, akun, siswaId);
    masuk(day(prev, 5 + (i % 8)), "KTG_bimbel", 1500000, `Cicilan 1 - ${kode} ${nama}`, akun, siswaId);
    if (i % 4 !== 3) masuk(day(cur, 5 + (i % 9)), "KTG_bimbel", 1500000, `Cicilan 2 - ${kode} ${nama}`, akun, siswaId);
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

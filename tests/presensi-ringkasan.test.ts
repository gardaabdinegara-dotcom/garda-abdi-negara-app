import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attendanceSummary, type Attendance, type AttendanceStatus, type Session } from "../src/lib/core/akademik";
import { filterPresensi, hitungRingkasanPresensi, rentangPembandingPresensi, susunDashboardPresensi } from "../src/lib/core/presensi-ringkasan";
import { toStudent } from "../src/lib/core/types";

const today = "2026-11-19";

function sesi(id: string, tanggal: string, peserta_ids: string[], status: Session["status"] = "SELESAI"): Session {
  return { sesi_id: id, tanggal, peserta_ids, status, nama: id, jam_mulai: "08:00", jam_selesai: "09:00", jenis: "Akademik", kelas_id: "K1", pengajar_id: "P1", seri_id: "" };
}

function catatan(session: string, student: string, status: AttendanceStatus, terlambat = false): Attendance {
  return {
    presensi_id: `${session}:${student}`, siswa_id: student, sesi_id: session, status, terlambat,
    status_diajukan: status === "MENUNGGU" ? "HADIR" : "", metode: "", waktu: "", catatan: "", disahkan_oleh: "", disahkan_pada: "",
  };
}

describe("periode ringkasan Presensi", () => {
  it("hari, minggu kalender dari Senin, dan bulan hingga tanggal lokal hari ini", () => {
    assert.deepEqual(filterPresensi(today, { periode: "hari" }), { periode: "hari", dari: today, sampai: today });
    assert.deepEqual(filterPresensi(today, { periode: "minggu" }), { periode: "minggu", dari: "2026-11-16", sampai: today });
    assert.deepEqual(filterPresensi("2026-01-01", { periode: "minggu" }), { periode: "minggu", dari: "2025-12-29", sampai: "2026-01-01" });
    assert.deepEqual(filterPresensi(today, {}), { periode: "bulan", dari: "2026-11-01", sampai: today });
    assert.deepEqual(filterPresensi(today, { periode: "kustom" }), { periode: "kustom", dari: "2026-11-01", sampai: today });
    assert.equal(filterPresensi(today, { periode: "__proto__" }).periode, "bulan");
  });

  it("tanggal kustom memeriksa kalender, kedua batas, dan urutan", () => {
    const invalid = filterPresensi(today, { periode: "kustom", dari: "2026-02-29", sampai: today });
    assert.equal(invalid.dari, "");
    assert.match(invalid.error ?? "", /tanggal awal dan akhir/);
    assert.match(filterPresensi(today, { periode: "kustom", dari: ["2026-11-12"], sampai: today }).error ?? "", /tanggal awal dan akhir/);
    assert.match(filterPresensi(today, { periode: "kustom", dari: "2026-11-18" }).error ?? "", /tanggal awal dan akhir/);
    assert.match(filterPresensi(today, { periode: "kustom", dari: today, sampai: "2026-11-18" }).error ?? "", /setelah tanggal awal/);
    const leap = filterPresensi(today, { periode: "kustom", dari: "2028-02-29", sampai: "2028-02-29" });
    assert.equal(leap.dari, "2028-02-29");
    assert.equal(leap.error, undefined);
  });

  it("periode pembanding mengikuti hari yang sepadan atau rentang kustom dengan jumlah hari sama", () => {
    assert.deepEqual(rentangPembandingPresensi(filterPresensi(today, { periode: "hari" })), { dari: "2026-11-18", sampai: "2026-11-18" });
    assert.deepEqual(rentangPembandingPresensi(filterPresensi(today, { periode: "minggu" })), { dari: "2026-11-09", sampai: "2026-11-12" });
    assert.deepEqual(rentangPembandingPresensi(filterPresensi("2026-01-19", {})), { dari: "2025-12-01", sampai: "2025-12-19" });
    assert.deepEqual(rentangPembandingPresensi(filterPresensi("2028-03-31", {})), { dari: "2028-02-01", sampai: "2028-02-29" });
    const kustom = filterPresensi(today, { periode: "kustom", dari: "2026-11-14", sampai: "2026-11-17" });
    assert.deepEqual(rentangPembandingPresensi(kustom), { dari: "2026-11-10", sampai: "2026-11-13" });
    const tahunPertama = filterPresensi(today, { periode: "kustom", dari: "0001-01-01", sampai: "0001-01-03" });
    assert.equal(rentangPembandingPresensi(tahunPertama), null);
  });
});

describe("ringkasan Presensi", () => {
  it("memakai peserta sesi selesai, menghitung ulang persentase dari total, dan memisahkan sesi terbuka", () => {
    const students = [
      toStudent({ siswa_id: "A", nama: "Arif", aktif: true }),
      toStudent({ siswa_id: "B", nama: "Budi", aktif: false }),
      toStudent({ siswa_id: "C", nama: "Citra", aktif: true }),
      toStudent({ siswa_id: "D", nama: "Dani", aktif: true }),
      toStudent({ siswa_id: "X", nama: "Dihapus", aktif: false, dihapus_pada: "2026-11-15" }),
      toStudent({ siswa_id: "E", nama: "Belum ikut sesi", aktif: true }),
    ];
    const sessions = [
      sesi("s1", "2026-11-12", ["A", "B", "X", "A"]),
      sesi("s2", "2026-11-16", ["B", "C", "D"]),
      sesi("aktif", "2026-11-16", ["A", "C"], "AKTIF"),
      sesi("batal", "2026-11-14", ["A"], "DIBATALKAN"),
      sesi("hapus", "2026-11-12", ["A"], "DIHAPUS"),
      sesi("luar-awal", "2026-11-11", ["A"]),
      sesi("luar-akhir", "2026-11-17", ["A"]),
    ];
    const records = new Map([
      catatan("s1", "A", "HADIR", true),
      catatan("s1", "B", "IZIN"),
      catatan("s1", "X", "HADIR"),
      catatan("s2", "B", "HADIR"),
      catatan("s2", "C", "SAKIT"),
      catatan("aktif", "A", "MENUNGGU"),
      catatan("aktif", "C", "HADIR"),
      catatan("batal", "A", "HADIR"),
    ].map((r) => [r.presensi_id, r]));

    const recap = hitungRingkasanPresensi({ dari: "2026-11-12", sampai: "2026-11-16" }, sessions, records, students);
    assert.deepEqual(recap.counts, { total: 5, hadir: 2, izin: 1, sakit: 1, alfa: 1, terlambat: 1, persen: 40 });
    assert.equal(recap.sesiSelesai, 2);
    assert.equal(recap.sesiTerbuka, 1);
    assert.equal(recap.pengajuanMenunggu, 1);
    assert.equal(recap.perluPerhatian, 3);
    assert.deepEqual(recap.rows.map(({ student, summary }) => [student.siswa_id, summary.persen]), [["C", 0], ["D", 0], ["B", 50], ["A", 100]]);
    assert.deepEqual(recap.interval.map((i) => i.counts.persen), [50, null, null, null, (1 / 3) * 100]);
    assert.deepEqual(recap.rows[2]?.summary, attendanceSummary("B", sessions, records, "2026-11"));
  });

  it("membatasi jumlah titik grafik untuk rentang panjang dan mempertahankan batas tanggal", () => {
    const students = [toStudent({ siswa_id: "A", nama: "Arif", aktif: true })];
    const range = { dari: "2025-01-01", sampai: "2027-02-05" };
    const sessions = [sesi("awal", range.dari, ["A"]), sesi("akhir", range.sampai, ["A"])];
    const recap = hitungRingkasanPresensi(range, sessions, new Map(), students);
    assert.ok(recap.interval.length <= 14);
    assert.equal(recap.interval[0]?.dari, range.dari);
    assert.equal(recap.interval.at(-1)?.sampai, range.sampai);
    assert.equal(recap.interval[0]?.counts.persen, 0);
    assert.equal(recap.interval.at(-1)?.counts.persen, 0);
    assert.equal(recap.counts.alfa, 2);
    assert.equal(recap.counts.persen, 0);
  });

  it("mengambil median perubahan persentase siswa yang punya sesi selesai di kedua periode", () => {
    const students = ["A", "B", "C", "D", "E", "F"].map((id) => toStudent({ siswa_id: id, nama: id, aktif: true }));
    const sessions = [
      sesi("lalu1", "2026-11-13", ["A", "B", "C", "D", "E"]),
      sesi("lalu2", "2026-11-14", ["A", "B", "C", "D"]),
      sesi("kini1", "2026-11-15", ["A", "B", "C", "D", "F"]),
      sesi("kini2", "2026-11-16", ["B", "C", "D"]),
      sesi("terbuka", "2026-11-16", ["E"], "AKTIF"),
      sesi("batal", "2026-11-16", ["E"], "DIBATALKAN"),
    ];
    const records = new Map([
      catatan("lalu1", "B", "HADIR"),
      catatan("lalu1", "C", "HADIR"),
      catatan("lalu1", "D", "HADIR"),
      catatan("lalu1", "E", "HADIR"),
      catatan("lalu2", "C", "HADIR"),
      catatan("lalu2", "D", "HADIR"),
      catatan("kini1", "A", "HADIR"),
      catatan("kini1", "C", "HADIR"),
      catatan("kini1", "D", "HADIR"),
      catatan("kini1", "F", "HADIR"),
      catatan("kini2", "D", "HADIR"),
      catatan("terbuka", "E", "HADIR"),
    ].map((r) => [r.presensi_id, r]));
    const filter = filterPresensi(today, { periode: "kustom", dari: "2026-11-15", sampai: "2026-11-16" });
    const dashboard = susunDashboardPresensi(filter, sessions, records, students);
    assert.equal(dashboard?.counts.persen, 62.5);
    assert.deepEqual(dashboard?.perbandingan, {
      sebelumnya: { dari: "2026-11-13", sampai: "2026-11-14" },
      median: -25,
      siswa: 4,
      naik: 1,
      tetap: 1,
      turun: 2,
    });
    const awal = filterPresensi(today, { periode: "kustom", dari: "2026-11-13", sampai: "2026-11-14" });
    const belumAdaPasangan = susunDashboardPresensi(awal, sessions, records, students)?.perbandingan;
    assert.equal(belumAdaPasangan?.siswa, 0);
    assert.equal(belumAdaPasangan?.median, null);
  });
});

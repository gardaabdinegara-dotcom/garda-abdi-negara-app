import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { attendanceTrend, type Attendance, type Session } from "../src/lib/core/akademik";

const session = (sesi_id: string, tanggal: string, peserta_ids: string[], status: Session["status"] = "SELESAI") =>
  ({ sesi_id, tanggal, peserta_ids, status }) as unknown as Session;
const record = (sesi_id: string, siswa_id: string, status: Attendance["status"]) =>
  [`${sesi_id}:${siswa_id}`, { presensi_id: `${sesi_id}:${siswa_id}`, sesi_id, siswa_id, status }] as [string, Attendance];

describe("grafik kehadiran Beranda", () => {
  const sessions = [
    session("s1", "2026-11-09", ["a", "b"]),
    session("s2", "2026-11-09", ["a", "c"]),
    session("s3", "2026-11-10", ["a", "b"]),
    session("s4", "2026-11-11", ["a", "b"], "AKTIF"),
    session("s5", "2026-11-12", ["x"]),
  ];
  const records = new Map([record("s1", "a", "HADIR"), record("s1", "b", "IZIN"), record("s2", "a", "HADIR"), record("s2", "c", "HADIR"), record("s3", "a", "HADIR")]);

  test("persentase hadir per tanggal, hanya sesi selesai dan siswa yang boleh dilihat", () => {
    const trend = attendanceTrend(sessions, records, new Set(["a", "b", "c"]));
    assert.deepEqual(
      trend.map((p) => [p.tanggal, p.hadir, p.total, Math.round(p.persen)]),
      [
        ["2026-11-09", 3, 4, 75],
        ["2026-11-10", 1, 2, 50],
      ],
    );
  });

  test("siswa di luar kelas tidak dihitung, dan hanya N tanggal terakhir", () => {
    const trend = attendanceTrend(sessions, records, new Set(["a"]), 1);
    assert.deepEqual(
      trend.map((p) => [p.tanggal, p.hadir, p.total]),
      [["2026-11-10", 1, 1]],
    );
  });
});

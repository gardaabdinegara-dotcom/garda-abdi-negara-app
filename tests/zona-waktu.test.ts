// Tampilan tanggal dan jam mengikuti zona waktu lembaga (Pengaturan → Lembaga), bukan WIB yang terkunci.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waktuLatihan } from "../src/components/latihan-hasil";
import { formatToday, greeting, todayISO } from "../src/lib/format";

// 20 Nov 2026 16.30 UTC = Jumat 23.30 WIB = Sabtu 00.30 WITA.
const LEWAT_TENGAH_MALAM_WITA = new Date("2026-11-20T16:30:00Z");
// 21 Nov 2026 03.30 UTC = 10.30 WIB (pagi) = 11.30 WITA (siang).
const PERGANTIAN_SAPAAN = new Date("2026-11-21T03:30:00Z");

describe("zona waktu tampilan", () => {
  it("tanggal hari ini berganti tepat tengah malam waktu lembaga", () => {
    assert.equal(todayISO("Asia/Jakarta", LEWAT_TENGAH_MALAM_WITA), "2026-11-20");
    assert.equal(todayISO("Asia/Makassar", LEWAT_TENGAH_MALAM_WITA), "2026-11-21");
    assert.match(formatToday("Asia/Makassar", LEWAT_TENGAH_MALAM_WITA), /^Sabtu, 21 November 2026$/);
    assert.match(formatToday("Asia/Jakarta", LEWAT_TENGAH_MALAM_WITA), /^Jumat, 20 November 2026$/);
  });

  it("sapaan beranda memakai jam lembaga", () => {
    assert.equal(greeting("Asia/Jakarta", PERGANTIAN_SAPAAN), "Selamat pagi");
    assert.equal(greeting("Asia/Makassar", PERGANTIAN_SAPAAN), "Selamat siang");
  });

  it("waktu latihan ditulis dalam jam lembaga", () => {
    assert.match(waktuLatihan("2026-11-21T03:30:00Z", "Asia/Makassar"), /21 Nov 2026.*11[.:]30/);
    assert.match(waktuLatihan("2026-11-21T03:30:00Z", "Asia/Jakarta"), /21 Nov 2026.*10[.:]30/);
  });
});

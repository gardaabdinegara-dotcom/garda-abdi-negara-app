// Pengaturan → Pesan WA: menyimpan template, menolak isian tak dikenal, dan kembali ke teks bawaan.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isiTemplate, WA_TEMPLATE_DEFAULT, WA_TEMPLATE_KEY, WA_TEMPLATE_MAX, waTemplates } from "../src/lib/core/wa";
import { saveWaTemplate, unknownWaFields, waTemplateInput } from "../src/lib/core/wa-template";
import { AppError } from "../src/lib/data/types";
import { actor, ctx, emptyTables } from "./helpers";

const owner = actor("OWNER");
const stored = (t: Awaited<ReturnType<typeof emptyTables>>, key: string) => t.Pengaturan!.find((row) => row.key === key)?.value;

describe("template pesan WA", () => {
  test("owner menyimpan teks; pesan Rekap memakai teks baru", async () => {
    const t = await emptyTables();
    const teks = "Bapak/Ibu wali {nama}, kehadiran {bulan}: {persen} ({hadir} dari {sesi}). Admin {lembaga}";
    const out = saveWaTemplate(t, waTemplateInput.parse({ jenis: "kehadiran", teks: `  ${teks}\r\n` }), ctx(), owner);
    assert.match(out.message, /disimpan/);
    assert.equal(stored(t, WA_TEMPLATE_KEY.kehadiran), teks);
    const pesan = isiTemplate(waTemplates({ Pengaturan: t.Pengaturan! }).kehadiran, { nama: "RAKA PRATAMA", bulan: "November", persen: "48%", hadir: 12, sesi: 25, lembaga: "Bimbel Contoh" });
    assert.equal(pesan, "Bapak/Ibu wali RAKA PRATAMA, kehadiran November: 48% (12 dari 25). Admin Bimbel Contoh");
    // Jenis lain tetap memakai bawaan.
    assert.equal(waTemplates({ Pengaturan: t.Pengaturan! }).latihan, WA_TEMPLATE_DEFAULT.latihan);
  });

  test("isian tak dikenal dan teks kosong ditolak; kembalikan bawaan menyimpan kosong", async () => {
    const t = await emptyTables();
    assert.deepEqual(unknownWaFields("kehadiran", "Halo {nama} {Nama} {nilai}"), ["Nama", "nilai"]);
    assert.throws(() => saveWaTemplate(t, waTemplateInput.parse({ jenis: "kehadiran", teks: "Halo {nilai}" }), ctx(), owner), (e: unknown) => e instanceof AppError && /\{nilai\}/.test(e.message));
    assert.throws(() => saveWaTemplate(t, waTemplateInput.parse({ jenis: "samapta", teks: "   " }), ctx(), owner), /wajib diisi/);
    saveWaTemplate(t, waTemplateInput.parse({ jenis: "samapta", teks: "Hasil {tes} ananda {nama}: {nilai}." }), ctx(), owner);
    const reset = saveWaTemplate(t, waTemplateInput.parse({ jenis: "samapta", aksi: "bawaan", teks: "abaikan" }), ctx(), owner);
    assert.match(reset.message, /bawaan/);
    assert.equal(stored(t, WA_TEMPLATE_KEY.samapta), "");
    assert.equal(waTemplates({ Pengaturan: t.Pengaturan! }).samapta, WA_TEMPLATE_DEFAULT.samapta);
    // Teks yang sama persis dengan bawaan juga disimpan kosong.
    saveWaTemplate(t, waTemplateInput.parse({ jenis: "latihan", teks: WA_TEMPLATE_DEFAULT.latihan }), ctx(), owner);
    assert.equal(stored(t, WA_TEMPLATE_KEY.latihan), "");
  });

  test("hanya owner; panjang dibatasi", async () => {
    const t = await emptyTables();
    assert.throws(() => saveWaTemplate(t, waTemplateInput.parse({ jenis: "latihan", teks: "Halo {nama}" }), ctx(), actor("ADMIN")), (e: unknown) => e instanceof AppError && e.code === "FORBIDDEN");
    assert.equal(waTemplateInput.safeParse({ jenis: "latihan", teks: "x".repeat(WA_TEMPLATE_MAX + 1) }).success, false);
    assert.equal(waTemplateInput.safeParse({ jenis: "lain", teks: "Halo" }).success, false);
  });
});

// Pendaftaran terpadu: siswa + pendaftaran (Inti) lalu ketentuan biaya + tagihan pertama (Keuangan).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PartialSaveError, registerIntegrated, type FinanceDraft } from "../../src/lib/core/terpadu";
import { studentInput } from "../../src/lib/core/validation";
import { AppError } from "../../src/lib/data/types";
import { persisted } from "./fixture";

const student = (nama: string) => studentInput.parse({ nama, jenis_kelamin: "P", jalur_target: "TNI" });
const fee = (extra: Partial<FinanceDraft> = {}): FinanceDraft => ({
  skema_biaya: "PAKET",
  tarif_disepakati: "1500000",
  hari_jatuh_tempo: "5",
  terbitkan: true,
  tanggal_terbit: "2026-11-05",
  periode_layanan: "",
  cicilan: 2,
  jatuh_tempo_pertama: "2026-11-10",
  ...extra,
});

async function counts(f: Awaited<ReturnType<typeof persisted>>) {
  const inti = await f.deps.store.read("inti", ["Siswa", "Pendaftaran"]);
  const keu = await f.deps.store.read("keuangan", ["Ketentuan_Biaya", "Tagihan", "Jadwal_Tagihan"]);
  return { siswa: inti.Siswa!.length, daftar: inti.Pendaftaran!.length, biaya: keu.Ketentuan_Biaya!.length, tagihan: keu.Tagihan!.length, jadwal: keu.Jadwal_Tagihan!.length };
}

test("siswa baru, pendaftaran, ketentuan biaya, dan tagihan pertama dalam satu isian", async () => {
  const f = await persisted();
  const before = await counts(f);
  const result = await registerIntegrated(f.deps, f.recorder, {
    operationId: randomUUID(),
    student: student("Citra Lestari"),
    enrollment: { program_id: f.program, kelas_id: f.kelas, tanggal_mulai: "2026-11-01" },
    finance: fee(),
  });
  assert.match(result.kode_siswa, /^GAN-\d{4}$/);
  assert.ok(result.pendaftaran_id && result.tagihan_id);
  assert.match(result.message, /tagihan pertama diterbitkan/);
  const after = await counts(f);
  assert.deepEqual(after, { siswa: before.siswa + 1, daftar: before.daftar + 1, biaya: before.biaya + 1, tagihan: before.tagihan + 1, jadwal: before.jadwal + 2 });
});

test("biaya gagal setelah siswa tersimpan: pesan jelas, lalu kirim ulang dengan ID sama tidak menggandakan siswa", async () => {
  const f = await persisted();
  const before = await counts(f);
  const operationId = randomUUID();
  const input = { operationId, student: student("Dina Maharani"), enrollment: { program_id: f.program, kelas_id: f.kelas, tanggal_mulai: "2026-11-01" } };
  await assert.rejects(
    registerIntegrated(f.deps, f.recorder, { ...input, finance: fee({ tarif_disepakati: "1000000" }) }),
    (error: unknown) => error instanceof PartialSaveError && /sudah tersimpan/.test(error.message) && /Tarif khusus/.test(error.message),
  );
  const middle = await counts(f);
  assert.equal(middle.siswa, before.siswa + 1, "siswa sudah tersimpan");
  assert.equal(middle.biaya, before.biaya, "biaya belum tersimpan");
  await registerIntegrated(f.deps, f.recorder, { ...input, finance: fee() });
  const after = await counts(f);
  assert.equal(after.siswa, before.siswa + 1, "tidak ada siswa ganda");
  assert.equal(after.daftar, before.daftar + 1);
  assert.equal(after.tagihan, before.tagihan + 1);
});

test("tanpa akses Catat, isian biaya ditolak sebelum apa pun ditulis", async () => {
  const f = await persisted();
  const before = await counts(f);
  await assert.rejects(
    registerIntegrated(f.deps, f.viewer, { operationId: randomUUID(), student: student("Eka"), enrollment: { program_id: f.program, kelas_id: f.kelas, tanggal_mulai: "2026-11-01" }, finance: fee() }),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
  );
  assert.deepEqual(await counts(f), before);
});

test("siswa yang sudah ada: pendaftaran bulanan, tagihan bulan mulai", async () => {
  const f = await persisted();
  const result = await registerIntegrated(f.deps, f.owner, {
    operationId: randomUUID(),
    siswa_id: f.budi,
    enrollment: null,
    finance: null,
  }).catch((e) => e);
  assert.equal(result.pendaftaran_id, "", "tanpa pendaftaran tidak ada yang ditulis ke keuangan");
  // Budi sudah terdaftar di program yang sama; program lain untuk skema bulanan.
  const program = (await f.deps.store.read("inti", ["Program"])).Program![0]!.program_id;
  await assert.rejects(
    registerIntegrated(f.deps, f.owner, { operationId: randomUUID(), siswa_id: f.budi, enrollment: { program_id: String(program), kelas_id: f.kelas, tanggal_mulai: "2026-12-01" } }),
    /pendaftaran aktif/,
  );
  const fresh = await registerIntegrated(f.deps, f.owner, {
    operationId: randomUUID(),
    student: student("Fani"),
    enrollment: { program_id: f.program, kelas_id: f.kelas, tanggal_mulai: "2026-12-01" },
    finance: fee({ skema_biaya: "BULANAN", tarif_disepakati: "500000", cicilan: 1, jatuh_tempo_pertama: "" }),
  });
  const invoice = (await f.deps.store.read("keuangan", ["Tagihan"])).Tagihan!.find((i) => i.tagihan_id === fresh.tagihan_id)!;
  assert.equal(invoice.periode_layanan, "2026-12", "bulan layanan pertama mengikuti tanggal mulai");
  assert.equal(invoice.jenis_tagihan, "BULANAN");
});

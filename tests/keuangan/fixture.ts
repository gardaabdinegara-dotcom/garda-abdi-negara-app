// Data uji keuangan bersama: lembaga kecil dengan satu program, satu kelas, dan dua siswa.
import { createEnrollment, createStudent, saveClass, saveProgram } from "../../src/lib/core/domain";
import type { Actor } from "../../src/lib/core/types";
import { studentInput } from "../../src/lib/core/validation";
import { randomUUID } from "node:crypto";
import { runOperation } from "../../src/lib/data/coordinator";
import type { Tables } from "../../src/lib/data/types";
import { applyFinanceCommand, FINANCE_TABLES } from "../../src/lib/keuangan/sumber";
import { actor, ctx, freshDeps, INTI_TABLES } from "../helpers";

export async function financeFixture() {
  const deps = await freshDeps();
  const inti = await deps.store.read("inti", INTI_TABLES.filter((n) => n !== "Operasi"));
  const keu = await deps.store.read("keuangan", [...FINANCE_TABLES]);
  const owner = actor("OWNER");
  const recorder = actor("ADMIN", { akses: "CATAT" });
  const viewer = actor("ADMIN", { akses: "LIHAT" });
  const program = saveProgram(inti, { program_id: "", nama_program: "Reguler TNI", target_seleksi: "TNI", aktif: true }, ctx(), owner).entityId;
  const kelas = saveClass(inti, { kelas_id: "", nama_kelas: "TNI A", program_id: program, angkatan: "2026", aktif: true }, ctx(), owner).entityId;
  const student = (nama: string) => createStudent(inti, studentInput.parse({ nama, jenis_kelamin: "L", jalur_target: "TNI" }), ctx(), owner).entityId;
  const andi = student("Andi Saputra");
  const budi = student("Budi Santoso");
  const enroll = (siswa_id: string) => createEnrollment(inti, { siswa_id, program_id: program, kelas_id: kelas, tanggal_mulai: "2026-11-01" }, ctx(), owner).entityId;
  return { deps, inti, keu, owner, recorder, viewer, program, kelas, andi, budi, dafAndi: enroll(andi), dafBudi: enroll(budi) };
}

type Fixture = Awaited<ReturnType<typeof financeFixture>>;

export const run = (f: Pick<Fixture, "inti" | "keu">, who: Actor, action: string, data: Record<string, unknown>) =>
  applyFinanceCommand(f.inti, f.keu, { action, data }, ctx(who.user.user_id), who);

export async function readyFixture() {
  const f = await financeFixture();
  run(f, f.owner, "finance.bootstrap", { tanggal_saldo_awal: "2026-11-01" });
  run(f, f.owner, "tariff.save", { program_id: f.program, skema_default: "PAKET", tarif_default: "1500000" });
  run(f, f.owner, "fee.save", { pendaftaran_id: f.dafAndi, skema_biaya: "PAKET", tarif_disepakati: "1500000", hari_jatuh_tempo: "5" });
  return f;
}

/** Menyimpan data fixture ke penyimpanan palsu agar perintah berikutnya lewat koordinator sungguhan. */
export async function persisted() {
  const f = await readyFixture();
  const seed = (sheet: "inti" | "keuangan", source: Tables, tables: readonly string[]) =>
    runOperation(f.deps, {
      sheet,
      operationId: randomUUID(),
      actorId: "SISTEM",
      action: "uji",
      fingerprint: randomUUID(),
      tables,
      apply: (t) => {
        for (const name of tables) if (name !== "Operasi" && name !== "Operasi_Keuangan") t[name] = source[name]!.map((r) => ({ ...r }));
        return { entityType: "Uji", entityId: "seed", message: "ok" };
      },
    });
  await seed("inti", f.inti, INTI_TABLES);
  await seed("keuangan", f.keu, FINANCE_TABLES);
  const keu = await f.deps.store.read("keuangan", ["Tagihan", "Akun"]);
  return { ...f, akun: String(keu.Akun!.find((a) => a.jenis_akun === "BANK")!.akun_id) };
}

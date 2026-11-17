// Impor siswa sekaligus dari daftar nama (mis. salinan dari WhatsApp).
import type { OperationContext, OperationOutcome } from "../data/coordinator";
import type { Tables } from "../data/types";
import { str } from "../data/rows";
import { createStudent } from "./domain";
import { createStudentAccount } from "./pin";
import type { Actor, Target } from "./types";
import { studentInput } from "./validation";

// Karakter tak terlihat yang sering ikut tersalin dari aplikasi pesan.
const INVISIBLE = /[­​-‏‪-‮⁠-⁤﻿]/g;

/**
 * Satu nama per baris. Nomor urut di depan ("1.", "12)", "3 -") dan karakter tak terlihat dibuang,
 * spasi dirapikan, tetapi huruf besar/kecil dibiarkan persis seperti aslinya. Baris kosong dilewati.
 */
export function parseNameList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(INVISIBLE, "")
        .replace(/^\s*\d+\s*[.)\-:]?\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((name) => name.length > 0);
}

export interface ImportResult {
  added: { nama: string; kode_siswa: string }[];
  skipped: string[];
}

/**
 * Menambahkan siswa yang belum ada (nama sama, tanpa memedulikan huruf besar/kecil, dilewati).
 * `perempuan` berisi nomor urut (mulai 1) pada daftar yang berjenis kelamin perempuan; sisanya laki-laki.
 */
export function importStudents(
  t: Tables,
  names: readonly string[],
  options: { jalur_target: Target; perempuan?: readonly number[]; tanggal_daftar?: string },
  ctx: OperationContext,
  actor: Actor,
): OperationOutcome<ImportResult> {
  const existing = new Set((t.Siswa ?? []).map((row) => str(row.nama).toLowerCase()));
  const female = new Set(options.perempuan ?? []);
  const result: ImportResult = { added: [], skipped: [] };
  for (const [i, nama] of names.entries()) {
    const key = nama.toLowerCase();
    if (existing.has(key)) {
      result.skipped.push(nama);
      continue;
    }
    const input = studentInput.parse({ nama, jenis_kelamin: female.has(i + 1) ? "P" : "L", jalur_target: options.jalur_target, tanggal_daftar: options.tanggal_daftar ?? "" });
    const out = createStudent(t, input, ctx, actor);
    // Setiap siswa langsung punya akun login (username = kode siswa, PIN dibuat sendiri saat masuk pertama).
    createStudentAccount(t, out.entityId, ctx, actor);
    result.added.push({ nama, kode_siswa: String((out.data as { kode_siswa: string }).kode_siswa) });
    existing.add(key);
  }
  return {
    entityType: "Siswa",
    entityId: "impor",
    message: `${result.added.length} siswa ditambahkan, ${result.skipped.length} dilewati karena sudah ada.`,
    data: result,
  };
}

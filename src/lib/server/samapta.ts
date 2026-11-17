import "server-only";
import { notFound } from "next/navigation";
import { academicSettings, localClock } from "../core/akademik";
import {
  canManageSamapta,
  emptyResult,
  KLASIFIKASI,
  participantsOfTest,
  rankOf,
  samaptaSettings,
  scoreOf,
  testProgress,
  toSamaptaResult,
  toSamaptaTest,
  type Klasifikasi,
  type Pos,
  type SamaptaResult,
  type SamaptaScore,
  type SamaptaSettings,
  type SamaptaTest,
} from "../core/samapta";
import { linkedStudentIds, toStudent, type Actor, type Student } from "../core/types";
import type { Tables } from "../data/types";
import { deps } from "../deps";

const TABLES = ["Pengaturan", "Siswa", "Tes_Samapta", "Hasil_Samapta"] as const;
const read = () => deps().store.read("inti", TABLES);

export interface SamaptaEntry {
  student: Student;
  result: SamaptaResult;
  score: SamaptaScore;
  /** Peringkat hasil akhir dalam tes ini (null bila hasil akhir belum lengkap). */
  rank: number | null;
  /** Usia pada tanggal tes. */
  usia: number | null;
}

export interface TestSummary {
  test: SamaptaTest;
  peserta: number;
  progress: Record<Pos, number>;
  /** Peserta yang hasil akhirnya sudah bisa dihitung. */
  lengkap: number;
  rata: number | null;
  klas: Record<Klasifikasi, number>;
}

/** Usia (tahun penuh) pada tanggal tertentu. */
export function ageAt(tanggalLahir: string, tanggal: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) return null;
  const [y1, m1, d1] = tanggalLahir.split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = tanggal.split("-").map(Number) as [number, number, number];
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

function today(t: Tables): string {
  return localClock(academicSettings(t).zona_waktu, new Date().toISOString()).date;
}

function model(t: Tables) {
  const settings = samaptaSettings(t);
  const students = (t.Siswa ?? []).map(toStudent);
  const tests = (t.Tes_Samapta ?? []).map(toSamaptaTest).sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.tes_id.localeCompare(a.tes_id));
  const results = new Map<string, Map<string, SamaptaResult>>();
  for (const row of t.Hasil_Samapta ?? []) {
    const r = toSamaptaResult(row);
    if (!results.has(r.tes_id)) results.set(r.tes_id, new Map());
    results.get(r.tes_id)!.set(r.siswa_id, r);
  }
  return { settings, students, tests, results };
}

function entriesOf(test: SamaptaTest, m: ReturnType<typeof model>): SamaptaEntry[] {
  const byStudent = m.results.get(test.tes_id) ?? new Map<string, SamaptaResult>();
  const base = participantsOfTest(test, m.students).map((student) => {
    const result = byStudent.get(student.siswa_id) ?? emptyResult(test.tes_id, student.siswa_id);
    return { student, result, score: scoreOf(result, student.jenis_kelamin, m.settings), usia: ageAt(student.tanggal_lahir, test.tanggal) };
  });
  const ranks = rankOf(base.filter((e) => e.score.akhir !== null).map((e) => ({ siswa_id: e.student.siswa_id, akhir: e.score.akhir })));
  return base.map((e) => ({ ...e, rank: ranks.get(e.student.siswa_id) ?? null }));
}

function summarize(test: SamaptaTest, entries: readonly SamaptaEntry[]): TestSummary {
  const results = new Map(entries.map((e) => [e.student.siswa_id, e.result]));
  const done = entries.filter((e) => e.score.akhir !== null);
  const klas = Object.fromEntries(KLASIFIKASI.map((k) => [k, done.filter((e) => e.score.klas === k).length])) as Record<Klasifikasi, number>;
  return {
    test,
    peserta: entries.length,
    progress: testProgress(entries.map((e) => e.student.siswa_id), results),
    lengkap: done.length,
    rata: done.length ? Math.round((done.reduce((sum, e) => sum + e.score.akhir!, 0) / done.length) * 100) / 100 : null,
    klas,
  };
}

function requireStaff(actor: Actor) {
  if (!canManageSamapta(actor)) notFound();
}

/** Daftar semua tes (terbaru dulu) beserta kemajuan isian. Khusus owner/staf. */
export async function loadSamaptaOverview(actor: Actor) {
  requireStaff(actor);
  const t = await read();
  const m = model(t);
  return { settings: m.settings, today: today(t), tests: m.tests.map((test) => summarize(test, entriesOf(test, m))) };
}

/** Satu tes lengkap: peserta, isian, hasil, dan pembanding tes sebelumnya. Khusus owner/staf. */
export async function loadSamaptaTest(actor: Actor, tesId: string) {
  requireStaff(actor);
  const t = await read();
  const m = model(t);
  const test = m.tests.find((x) => x.tes_id === tesId);
  if (!test) notFound();
  const entries = entriesOf(test, m);
  const previousTest = m.tests.find((x) => x.tes_id !== test.tes_id && x.status !== "DIBATALKAN" && (x.tanggal < test.tanggal || (x.tanggal === test.tanggal && x.tes_id < test.tes_id)));
  const previous = previousTest ? { test: previousTest, entries: entriesOf(previousTest, m) } : null;
  const nonParticipants = m.students.filter((s) => s.aktif && !test.peserta_ids.includes(s.siswa_id)).sort((a, b) => a.kode_siswa.localeCompare(b.kode_siswa));
  return { settings: m.settings, test, entries, summary: summarize(test, entries), previous, nonParticipants };
}

export interface StudentHistoryItem {
  test: SamaptaTest;
  entry: SamaptaEntry;
  peserta: number;
}

/** Riwayat tes seorang siswa (lama → baru). Owner/staf, atau siswa itu sendiri. */
export async function loadSamaptaStudent(actor: Actor, siswaId: string) {
  const own = linkedStudentIds(actor, "SISWA").includes(siswaId);
  if (!canManageSamapta(actor) && !own) notFound();
  const t = await read();
  const m = model(t);
  const student = m.students.find((s) => s.siswa_id === siswaId);
  if (!student) notFound();
  const history: StudentHistoryItem[] = [...m.tests]
    .reverse()
    .filter((test) => test.peserta_ids.includes(siswaId) && test.status !== "DIBATALKAN")
    .map((test) => {
      const entries = entriesOf(test, m);
      return { test, entry: entries.find((e) => e.student.siswa_id === siswaId)!, peserta: entries.length };
    });
  return { settings: m.settings, student, history };
}

/**
 * Hasil satu siswa pada satu tes, ditambah tes sebelumnya yang juga ia ikuti (untuk pembanding).
 * Khusus owner/staf (halaman detail siswa di hasil tes).
 */
export async function loadSamaptaResult(actor: Actor, tesId: string, siswaId: string) {
  requireStaff(actor);
  const t = await read();
  const m = model(t);
  const test = m.tests.find((x) => x.tes_id === tesId);
  if (!test) notFound();
  const entries = entriesOf(test, m);
  const entry = entries.find((e) => e.student.siswa_id === siswaId);
  if (!entry) notFound();
  // m.tests terurut terbaru dulu, jadi yang pertama cocok adalah tes sebelumnya yang terdekat.
  const prevTest = m.tests.find(
    (x) => x.tes_id !== test.tes_id && x.status !== "DIBATALKAN" && x.peserta_ids.includes(siswaId) && (x.tanggal < test.tanggal || (x.tanggal === test.tanggal && x.tes_id < test.tes_id)),
  );
  let previous: StudentHistoryItem | null = null;
  if (prevTest) {
    const prevEntries = entriesOf(prevTest, m);
    const prevEntry = prevEntries.find((e) => e.student.siswa_id === siswaId);
    if (prevEntry) previous = { test: prevTest, entry: prevEntry, peserta: prevEntries.length };
  }
  return { settings: m.settings, test, entry, peserta: entries.length, previous };
}

/** Siswa yang masuk: riwayat tesnya sendiri. */
export async function loadMySamapta(actor: Actor) {
  const siswaId = linkedStudentIds(actor, "SISWA")[0];
  if (!siswaId) return null;
  return loadSamaptaStudent(actor, siswaId);
}

/**
 * Data cetak blangko terisi. `siswa` = satu siswa_id, atau "semua" untuk seluruh peserta.
 * Siswa hanya boleh mencetak blangkonya sendiri.
 */
export async function loadBlangko(actor: Actor, tesId: string, siswa: string): Promise<{ settings: SamaptaSettings; test: SamaptaTest; entries: SamaptaEntry[] }> {
  const own = linkedStudentIds(actor, "SISWA");
  const staff = canManageSamapta(actor);
  if (!staff && (siswa === "semua" || !own.includes(siswa))) notFound();
  const t = await read();
  const m = model(t);
  const test = m.tests.find((x) => x.tes_id === tesId);
  if (!test) notFound();
  const entries = entriesOf(test, m).filter((e) => siswa === "semua" || e.student.siswa_id === siswa);
  if (entries.length === 0) notFound();
  return { settings: m.settings, test, entries };
}

/** Pengaturan untuk blangko kosong. Khusus owner/staf. */
export async function loadBlankSettings(actor: Actor) {
  requireStaff(actor);
  const t = await deps().store.read("inti", ["Pengaturan"]);
  return samaptaSettings(t);
}

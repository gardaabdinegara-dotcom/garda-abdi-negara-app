"use client";

// Tes Samapta di HP: mode lapangan per pos (satu siswa per layar, papan angka sendiri), lembar "Buat tes",
// menu cetak blangko, dan tabel peringkat yang bisa dibuka per siswa.
// - Papan angka buatan sendiri: kotak isian adalah tombol, jadi keyboard HP tidak pernah muncul
//   (kecuali kolom riwayat kesehatan yang memang berupa teks).
// - Simpan & lanjut menyimpan di latar belakang lalu pindah ke siswa berikutnya yang belum.
//   operation_id baru dibuat untuk setiap isian berbeda; kirim ulang isian yang sama memakai id yang sama.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { simpanPosSamapta, simpanTesSamapta } from "@/app/actions/samapta";
import { fmt, isPosComplete, KLAS_TONE, normalizeDuration, normalizeTensi, posValuesBrief, posValuesWithScore, POS_TITLE } from "@/app/(ruang)/samapta/samapta-ui";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { GAYA_RENANG, imtLabel, imtOf, parseDuration, pullLabel, type Klasifikasi, type Pos } from "@/lib/core/samapta";
import { GARJAS_FIELDS, garjasAgeBand, isGarjasPos, type GarjasPos } from "@/lib/core/samapta-garjas";
import { ActionForm, Field, SubmitButton } from "./form";
import { Icon } from "./icon";
import { SamIcon } from "./samapta-icon";
import { WaKabari } from "./wa";
import { bukaDialog } from "@/lib/dialog";

// ================================================================ Mode lapangan

export interface FieldStudent {
  id: string;
  nama: string;
  inisial: string;
  no: number;
  jk: "L" | "P" | "";
  usia: number | null;
  /** Isian tersimpan beserta nilai untuk pos ini. */
  values: Record<string, string>;
  /** Hasil pos ini di tes sebelumnya. */
  prev: { main: string; sub: string } | null;
}

export interface FieldModeProps {
  tesId: string;
  tesNama: string;
  pos: Pos;
  locked: "" | "SELESAI" | "DIBATALKAN";
  prevName: string | null;
  students: FieldStudent[];
  initialId: string | null;
  initialAll: boolean;
  closeHref: string;
  hasilHref: string;
  nextPos: { href: string; label: string } | null;
}

type Kind = "int" | "dec" | "tensi" | "dur" | "gaya";

interface FDef {
  name: string;
  label: string;
  /** Nama lengkap untuk pesan galat. */
  what: string;
  unit: string;
  kind: Kind;
  max: number;
  range?: readonly [number, number];
}

function garjasField(pos: GarjasPos, label: string, unit: string, max: number): FDef {
  const { field, label: what, integer, range } = GARJAS_FIELDS[pos];
  return { name: field, label, what, unit, max, range, kind: integer ? "int" : "dec" };
}

const FIELDS: Record<Pos, FDef[]> = {
  tensi: ["I", "II", "III"].map((n, i) => ({ name: `tensi_${i + 1}`, label: `Tensi ${n}`, what: `Tensi ${n}`, unit: "", kind: "tensi", max: 7 })),
  badan: [
    { name: "tinggi_cm", label: "Tinggi", what: "Tinggi badan", unit: "cm", kind: "dec", max: 5, range: [100, 230] },
    { name: "berat_kg", label: "Berat", what: "Berat badan", unit: "kg", kind: "dec", max: 5, range: [25, 200] },
  ],
  lari: [garjasField("lari", "Jarak", "m", 4)],
  pull: [garjasField("pull", "Jumlah", "kali", 3)],
  situp: [garjasField("situp", "Jumlah", "kali", 3)],
  pushup: [garjasField("pushup", "Jumlah", "kali", 3)],
  shuttle: [garjasField("shuttle", "Waktu", "dtk", 5)],
  renang: [
    { name: "renang_gaya", label: "Gaya", what: "Gaya renang", unit: "", kind: "gaya", max: 0 },
    { name: "renang_waktu", label: "Waktu", what: "Waktu renang", unit: "dtk", kind: "dur", max: 6 },
  ],
};

const RIWAYAT = ["riwayat_1", "riwayat_2", "riwayat_3"];

const TIP: Record<Pos, string> = {
  tensi: "Ketuk kotak, lalu ketik seperti 120/80. Garis miring otomatis setelah 3 angka.",
  badan: "Tinggi dalam cm, berat dalam kg. IMT dihitung sendiri.",
  lari: "Isi jarak dalam meter. Nilai Garjas A langsung terbaca dari tabel.",
  pull: "Isi jumlah gerakan yang sah dalam 1 menit.",
  situp: "Isi jumlah sit up dalam 1 menit. Putri memakai gerakan modifikasi.",
  pushup: "Isi jumlah push up dalam 1 menit. Putri memakai gerakan modifikasi.",
  shuttle: "Isi waktu dalam detik, mis. 17,4.",
  renang: "Pilih gaya dan isi waktu. Ketik 1,05 untuk 1:05.",
};

type Values = Record<string, string>;
interface Draft {
  values: Values;
  /** Isian server saat draf dibuat. */
  base: string;
  /** Isian yang terakhir berhasil disimpan. */
  ok?: string;
  /** Isian yang sedang dikirim. */
  sent?: string;
}
type SaveState = { s: "saving" } | { s: "ok" } | { s: "error"; message: string };

const snap = (v: Values) => JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k] ?? ""]));

function normalize(pos: Pos, values: Values): Values {
  const out: Values = {};
  for (const [key, raw] of Object.entries(values)) {
    const v = (raw ?? "").trim().replace(/,$/, "");
    out[key] = key.startsWith("tensi_") ? normalizeTensi(v) : key === "renang_waktu" ? normalizeDuration(v) : v;
  }
  return out;
}

/** Pemeriksaan cepat di HP (cermin aturan server; server tetap penentu). */
function check(def: FDef, raw: string): string | null {
  const v = raw.trim().replace(/,$/, "");
  if (!v) return null;
  switch (def.kind) {
    case "tensi": {
      const m = /^(\d{2,3})\/(\d{2,3})$/.exec(v);
      const sys = Number(m?.[1]);
      const dia = Number(m?.[2]);
      return !m || sys < 60 || sys > 260 || dia < 30 || dia > 160 || dia >= sys ? `${def.what} tidak valid. Tulis seperti 120/80.` : null;
    }
    case "dur":
      try {
        parseDuration(normalizeDuration(v), def.what);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : `${def.what} tidak valid.`;
      }
    case "gaya":
      return (GAYA_RENANG as readonly string[]).includes(v) ? null : "Pilih gaya renang.";
    default: {
      const n = Number(v.replace(",", "."));
      const [lo, hi] = def.range ?? [0, Number.MAX_SAFE_INTEGER];
      if (!Number.isFinite(n) || n < lo || n > hi) return `${def.what} harus antara ${lo} dan ${hi}.`;
      if (def.kind === "int" && !Number.isInteger(n)) return `${def.what} harus bilangan bulat.`;
      return null;
    }
  }
}

/** Satu tombol papan angka ditekan pada kotak aktif. null = tombol tidak berlaku. */
function typeKey(def: FDef, current: string, key: string, fresh: boolean): string | null {
  const v = fresh ? "" : current;
  if (key === "back") return fresh ? "" : current.slice(0, -1);
  if (key === "sep") {
    if (def.kind === "tensi") return v && !v.includes("/") ? `${v}/` : null;
    if (def.kind === "int" || v.includes(",")) return null;
    return `${v || "0"},`;
  }
  if (def.kind === "tensi") {
    const parts = v.split("/");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 1 && last.length === 3) return `${v}/${key}`;
    if (last.length >= 3 || v.length >= def.max) return null;
    return v + key;
  }
  if (v.length >= def.max) return null;
  const dec = v.split(",")[1];
  if (dec !== undefined && dec.length >= 2) return null;
  if (v === "0") return key;
  return v + key;
}

async function callSave(formData: FormData): Promise<ActionState> {
  try {
    return await simpanPosSamapta(initialActionState, formData);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_")) throw error;
    return { ok: false, message: "Gagal terhubung. Periksa sinyal, lalu simpan lagi.", at: Date.now() };
  }
}

export function FieldMode(props: FieldModeProps) {
  if (props.students.length > 0) return <FieldModeInner {...props} />;
  return (
    <div className="sam-fm is-empty">
      <header className="sam-fm-top">
        <Link className="sam-tap" href={props.closeHref} aria-label="Tutup mode lapangan">
          <SamIcon name="close" />
        </Link>
        <div className="sam-fm-tt">
          <b>{POS_TITLE[props.pos]}</b>
          <small>{props.tesNama}</small>
        </div>
      </header>
      <div className="sam-fm-body">
        <div className="sam-fm-done">
          <b>Belum ada peserta</b>
          <p>Tambahkan peserta di halaman Data tes.</p>
          <Link className="btn" href={`${props.hasilHref}?tab=data`}>
            Buka data tes
          </Link>
        </div>
      </div>
    </div>
  );
}

function FieldModeInner(props: FieldModeProps) {
  const { tesId, tesNama, pos, students, prevName } = props;
  const router = useRouter();
  const defs = FIELDS[pos];
  const required = defs.map((d) => d.name);
  const keyDefs = defs.filter((d) => d.kind !== "gaya");
  const locked = props.locked !== "";
  const n = students.length;

  const firstIndex = () => {
    const byId = students.findIndex((s) => s.id === props.initialId);
    if (byId >= 0) return byId;
    const todo = students.findIndex((s) => !isPosComplete(pos, s.values));
    return todo >= 0 ? todo : 0;
  };
  const [index, setIndex] = useState(firstIndex);
  const [onlyTodo, setOnlyTodo] = useState(() => !props.initialAll && students.some((s) => !isPosComplete(pos, s.values)));
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [status, setStatus] = useState<Record<string, SaveState>>({});
  const [last, setLast] = useState<{ id: string; brief: string; partial: boolean } | null>(null);
  const [error, setError] = useState<{ id: string; name: string; message: string } | null>(null);
  const [done, setDone] = useState(false);
  const [trail, setTrail] = useState<number[]>([]);
  const [riwayatOpen, setRiwayatOpen] = useState<Record<string, boolean>>({});
  const [leaving, setLeaving] = useState(false);

  const cur = students[Math.min(index, n - 1)]!;
  const valuesOf = (s: FieldStudent): Values => drafts[s.id]?.values ?? s.values;
  const firstEmpty = (v: Values) => required.find((name) => !(v[name] ?? "").trim());
  const startField = (s: FieldStudent) => firstEmpty(valuesOf(s)) ?? required[0]!;

  const [active, setActive] = useState(() => startField(cur));
  const [fresh, setFresh] = useState(true);

  const opIds = useRef<Record<string, { op: string; snap: string }>>({});
  const chains = useRef<Record<string, Promise<boolean>>>({});
  const statusRef = useRef(status);
  const listRef = useRef<HTMLDialogElement>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => {});

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  /** Berubah dan belum terkirim (isian yang sedang dikirim dianggap sudah disimpan). */
  const dirtyOf = (s: FieldStudent) => {
    const d = drafts[s.id];
    if (!d) return false;
    const ref = status[s.id]?.s === "saving" && d.sent ? d.sent : (d.ok ?? d.base);
    return snap(normalize(pos, d.values)) !== ref;
  };
  /** Isian yang sudah disimpan atau sedang dikirim (ketikan yang belum disimpan tidak dihitung). */
  const committedOf = (s: FieldStudent): Values => (dirtyOf(s) ? s.values : valuesOf(s));
  const completeWith = (s: FieldStudent, override?: { id: string; values: Values }) => isPosComplete(pos, override && override.id === s.id ? override.values : committedOf(s));

  // Data server berubah (setelah simpan, atau diisi dari HP lain): draf yang tidak sedang diubah ikut data server.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of students) {
        const d = prev[s.id];
        if (!d || snap(s.values) === d.base) continue;
        if (statusRef.current[s.id]?.s === "saving" || snap(normalize(pos, d.values)) !== (d.ok ?? d.base)) continue;
        delete next[s.id];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [students, pos]);

  // Alamat ikut siswa yang tampil, supaya muat ulang tetap di siswa yang sama.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("siswa", cur.id);
    if (onlyTodo) url.searchParams.delete("semua");
    else url.searchParams.set("semua", "1");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url.pathname + url.search);
  }, [cur, onlyTodo]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    keyHandler.current = onKey;
  });

  const values = valuesOf(cur);
  const dirty = dirtyOf(cur);
  const filled = students.filter((s) => completeWith(s)).length;
  const todoCount = n - filled;
  const activeDef = defs.find((d) => d.name === active) ?? defs[0]!;
  const keyDef = activeDef.kind === "gaya" ? keyDefs[0]! : activeDef;

  function setValues(s: FieldStudent, next: Values) {
    const measured = posValuesWithScore(pos, next, s.jk, s.usia);
    setDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], values: measured, base: prev[s.id]?.base ?? snap(s.values) } }));
    if (error?.id === s.id) setError(null);
  }

  function activate(name: string) {
    setActive(name);
    setFresh(true);
  }

  function press(key: string) {
    if (locked || done) return;
    const def = keyDef;
    const next = typeKey(def, values[def.name] ?? "", key, fresh && active === def.name);
    if (active !== def.name) setActive(def.name);
    setFresh(false);
    if (next === null) return;
    setValues(cur, { ...values, [def.name]: next });
  }

  function problem(v: Values): { name: string; message: string } | null {
    for (const def of defs) {
      const message = check(def, v[def.name] ?? "");
      if (message) return { name: def.name, message };
    }
    return null;
  }

  function save(s: FieldStudent, v: Values): Promise<boolean> {
    const clean = normalize(pos, v);
    const sn = snap(clean);
    const known = opIds.current[s.id];
    const op = known && known.snap === sn ? known.op : crypto.randomUUID();
    opIds.current[s.id] = { op, snap: sn };
    setDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], values: clean, base: prev[s.id]?.base ?? snap(s.values), sent: sn } }));
    setStatus((prev) => ({ ...prev, [s.id]: { s: "saving" } }));
    setLast({ id: s.id, brief: posValuesBrief(pos, clean), partial: !isPosComplete(pos, clean) });
    const run = async () => {
      const formData = new FormData();
      formData.set("operation_id", op);
      formData.set("tes_id", tesId);
      formData.set("siswa_id", s.id);
      formData.set("pos", pos);
      for (const [key, value] of Object.entries(clean)) {
        if (key !== `${pos}_nilai`) formData.set(key, value);
      }
      const result = await callSave(formData);
      if (result.ok) {
        if (opIds.current[s.id]?.op === op) delete opIds.current[s.id];
        setDrafts((prev) => (prev[s.id] ? { ...prev, [s.id]: { ...prev[s.id]!, ok: sn } } : prev));
        setStatus((prev) => ({ ...prev, [s.id]: { s: "ok" } }));
        return true;
      }
      setStatus((prev) => ({ ...prev, [s.id]: { s: "error", message: result.message || "Belum tersimpan." } }));
      return false;
    };
    const chained = (chains.current[s.id] ?? Promise.resolve(true)).then(run, run);
    chains.current[s.id] = chained;
    return chained;
  }

  /** Simpan siswa ini bila berubah. false = isian tidak valid (tetap di siswa ini). */
  function commit(): boolean {
    if (locked || !dirty) return true;
    const bad = problem(values);
    if (bad) {
      setError({ id: cur.id, ...bad });
      activate(bad.name);
      return false;
    }
    void save(cur, values);
    return true;
  }

  function show(i: number, remember = true) {
    const s = students[i];
    if (!s) return;
    if (remember && i !== index) setTrail((t) => [...t.slice(-30), index]);
    setIndex(i);
    setActive(startField(s));
    setFresh(true);
    setDone(false);
    setError(null);
  }

  function nextIndex(from: number, override?: { id: string; values: Values }): number | null {
    if (onlyTodo) {
      for (let k = 1; k < n; k++) {
        const i = (from + k) % n;
        if (!completeWith(students[i]!, override)) return i;
      }
      return null;
    }
    if (from + 1 < n) return from + 1;
    const todo = students.findIndex((s, i) => i !== from && !completeWith(s, override));
    return todo >= 0 ? todo : null;
  }

  function goTo(i: number) {
    if (i === index && !done) return;
    if (!commit()) return;
    show(i);
  }

  function advance(override?: { id: string; values: Values }) {
    const nx = nextIndex(index, override);
    if (nx === null) {
      setTrail((t) => [...t.slice(-30), index]);
      setDone(true);
    } else show(nx);
  }

  function main() {
    if (done) return;
    if (locked) {
      advance();
      return;
    }
    const activeValue = (values[active] ?? "").trim();
    const activeProblem = check(activeDef, values[active] ?? "");
    if (activeProblem) {
      setError({ id: cur.id, name: active, message: activeProblem });
      setFresh(true);
      return;
    }
    const empty = firstEmpty(values);
    if (activeValue && empty) {
      activate(empty);
      return;
    }
    const bad = problem(values);
    if (bad) {
      setError({ id: cur.id, ...bad });
      activate(bad.name);
      return;
    }
    if (dirty) void save(cur, values);
    advance({ id: cur.id, values: normalize(pos, values) });
  }

  function back() {
    if (done) {
      setDone(false);
      return;
    }
    if (!commit()) return;
    const prev = trail[trail.length - 1];
    if (prev !== undefined) {
      setTrail((t) => t.slice(0, -1));
      show(prev, false);
    } else if (index > 0) show(index - 1, false);
  }

  async function close() {
    if (leaving) return;
    if (dirty && !locked) {
      const bad = problem(values);
      if (bad) {
        if (!window.confirm(`Isian ${cur.nama} belum benar dan belum tersimpan. Tetap keluar?`)) return;
      } else void save(cur, values);
    }
    setLeaving(true);
    const results = await Promise.all(Object.values(chains.current));
    const failedNow = Object.entries(chains.current).filter((_, i) => results[i] === false).map(([id]) => students.find((s) => s.id === id)?.nama ?? "");
    if (failedNow.length && !window.confirm(`Isian ${failedNow.join(", ")} belum tersimpan. Tetap keluar?`)) {
      setLeaving(false);
      return;
    }
    router.push(props.closeHref);
  }

  function openList() {
    bukaDialog(listRef.current);
  }

  function pickFromList(i: number) {
    listRef.current?.close();
    goTo(i);
  }

  function chooseGaya(gaya: string) {
    if (locked) return;
    const next: Values = { ...values, renang_gaya: values.renang_gaya === gaya ? "" : gaya };
    setValues(cur, next);
    if (!(next.renang_waktu ?? "").trim()) activate("renang_waktu");
  }

  function setRiwayat(name: string, text: string) {
    setValues(cur, { ...values, [name]: text });
  }

  function clearRiwayat() {
    setRiwayatOpen((o) => ({ ...o, [cur.id]: false }));
    if (RIWAYAT.some((k) => (values[k] ?? "") !== "")) setValues(cur, { ...values, ...Object.fromEntries(RIWAYAT.map((k) => [k, ""])) });
  }

  // Keyboard fisik (desktop): angka, koma/titik/garis miring, hapus, Enter = tombol utama.
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, dialog[open]")) return;
    if (/^\d$/.test(event.key)) press(event.key);
    else if ([",", ".", "/", ":"].includes(event.key)) press("sep");
    else if (event.key === "Backspace" || event.key === "Delete") press("back");
    // Enter = tombol utama, juga saat fokus ada di kotak isian atau papan angka (bukan tombol lain).
    else if (event.key === "Enter" && (!target?.closest("button, a") || target.closest(".sam-big, .sam-kp, .sam-dots"))) main();
    else return;
    event.preventDefault();
  };

  // ------------------------------------------------------------ tampilan
  const saving = Object.values(status).some((st) => st.s === "saving");
  const failed = Object.entries(status).find(([, st]) => st.s === "error");
  const pill = saving
    ? { tone: "saving", text: "Menyimpan…" }
    : failed
      ? { tone: "error", text: "Gagal simpan" }
      : dirty && !locked
        ? { tone: "dirty", text: "Belum disimpan" }
        : { tone: "ok", text: "Tersimpan" };

  const empty = firstEmpty(values);
  const activeFilled = Boolean((values[active] ?? "").trim());
  const complete = isPosComplete(pos, values);
  let mainLabel: string;
  if (locked) mainLabel = "Berikutnya";
  else if (activeFilled && empty) mainLabel = `Berikutnya: ${defs.find((d) => d.name === empty)!.label}`;
  else if (!dirty) mainLabel = complete ? "Lanjut" : "Lewati";
  else mainLabel = complete ? "Simpan & lanjut" : "Simpan sebagian";

  const upcoming = (() => {
    for (let k = 1; k < n; k++) {
      const s = students[(index + k) % n]!;
      if (!completeWith(s)) return s;
    }
    return null;
  })();

  const lastStudent = last ? students.find((s) => s.id === last.id) : undefined;
  const lastState = last ? status[last.id] : undefined;
  const curError = error && error.id === cur.id ? error : null;
  const curFail = status[cur.id]?.s === "error" ? (status[cur.id] as { message: string }).message : null;
  const sepLabel = keyDef.kind === "tensi" ? "/" : ",";
  const sepOff = locked || keyDef.kind === "int" || (keyDef.kind === "tensi" ? (values[keyDef.name] ?? "").includes("/") : false);
  const hasRiwayat = RIWAYAT.some((k) => (values[k] ?? "").trim() !== "");
  const riwayatShown = pos === "tensi" && (hasRiwayat || riwayatOpen[cur.id]);
  const who = `${cur.jk === "P" ? "Putri" : cur.jk === "L" ? "Putra" : "-"} · no. ${cur.no}${pos === "pull" ? ` · ${pullLabel(cur.jk)}` : ""}`;
  const showScore = isGarjasPos(pos) || pos === "renang";
  const score = values[`${pos}_nilai`] ?? "";
  const scoreHint = pos === "renang" && values.renang_gaya && values.renang_gaya !== "Dada"
    ? "Acuan untuk gaya dada"
    : isGarjasPos(pos) && !cur.jk
      ? "Isi jenis kelamin siswa"
      : `Acuan ${garjasAgeBand(cur.usia)} th`;

  const box = (def: FDef, extra?: React.ReactNode) => {
    const value = values[def.name] ?? "";
    const on = active === def.name && !locked;
    const shown =
      def.kind === "dur"
        ? normalizeDuration(value.replace(/,$/, "")) || value
        : def.kind === "int" && /^\d{4,}$/.test(value)
          ? Number(value).toLocaleString("id-ID")
          : value;
    const minutes = def.kind === "dur" && shown.includes(":");
    return (
      <button
        key={def.name}
        type="button"
        className={`sam-big${on ? " is-on" : ""}${on && fresh && value ? " is-fresh" : ""}${curError?.name === def.name ? " is-err" : ""}`}
        aria-pressed={on}
        aria-label={`${def.label}${value ? `: ${value} ${def.unit}` : ", kosong"}`}
        onClick={() => activate(def.name)}
        disabled={locked}
      >
        <span className="sam-big-l">{def.label}</span>
        <span className={`sam-big-v${value ? "" : " is-ph"}${shown.length > 5 ? " is-long" : ""}`}>
          <span className="sam-big-n">{value ? shown : on ? "" : "-"}</span>
          {on ? <i className="sam-caret" aria-hidden="true" /> : null}
          {value && def.unit ? <small>{minutes ? "mnt" : def.unit}</small> : null}
        </span>
        {extra}
      </button>
    );
  };

  const imt = (() => {
    if (pos !== "badan") return null;
    const t = Number((values.tinggi_cm ?? "").replace(",", "."));
    const b = Number((values.berat_kg ?? "").replace(",", "."));
    return t >= 100 && t <= 230 && b >= 25 && b <= 200 ? imtOf(t, b) : null;
  })();

  return (
    <div className={`sam-fm${locked ? " is-locked" : ""}${done ? " is-done" : ""}`}>
      <header className="sam-fm-top">
        <button type="button" className="sam-tap" onClick={close} aria-label="Tutup mode lapangan" disabled={leaving}>
          <SamIcon name="close" />
        </button>
        <div className="sam-fm-tt">
          <b>{POS_TITLE[pos]}</b>
          <small>
            {tesNama} · {filled}/{n} terisi
          </small>
        </div>
        <span className={`sam-saved is-${pill.tone}`} aria-live="polite">
          {pill.tone === "ok" ? <SamIcon name="tick" /> : pill.tone === "error" ? <SamIcon name="alert" /> : null}
          {pill.text}
        </span>
      </header>

      <div className="sam-fm-body">
        {locked ? (
          <p className="sam-fm-lock">
            <SamIcon name="lock" />
            <span>
              {props.locked === "SELESAI" ? "Tes sudah ditandai selesai, jadi isian dikunci." : "Tes ini dibatalkan, jadi isian dikunci."}{" "}
              <Link href={props.hasilHref}>Buka lagi di halaman hasil</Link>
            </span>
          </p>
        ) : null}
        <div className="sam-fm-ctl">
          <button type="button" className="sam-fchip" aria-pressed={onlyTodo} onClick={() => setOnlyTodo((v) => !v)}>
            <SamIcon name="filter" />
            Hanya yang belum · {todoCount}
          </button>
          <button type="button" className="sam-jump" onClick={openList} aria-haspopup="dialog">
            Siswa {index + 1}/{n}
            <SamIcon name="down" />
          </button>
        </div>
        <div className="sam-dots" aria-label="Kemajuan siswa">
          {students.map((s, i) => {
            const st = status[s.id]?.s;
            const ok = completeWith(s);
            return (
              <button
                key={s.id}
                type="button"
                className={`sam-dot${ok ? " is-ok" : ""}${i === index && !done ? " is-cur" : ""}${st === "error" ? " is-err" : ""}`}
                aria-label={`No. ${s.no} ${s.nama}, ${ok ? "sudah terisi" : "belum"}`}
                aria-current={i === index && !done ? "true" : undefined}
                onClick={() => goTo(i)}
              />
            );
          })}
        </div>

        {done ? (
          <div className="sam-fm-done">
            <span className="sam-fm-done-ic">
              <SamIcon name="tick" />
            </span>
            <b>{todoCount === 0 ? `${POS_TITLE[pos]} selesai` : "Tidak ada lagi yang belum"}</b>
            <p>
              {todoCount === 0
                ? `Semua ${n} siswa sudah terisi di pos ini.`
                : `${todoCount} siswa masih belum lengkap. Buka daftar siswa untuk memeriksanya.`}
            </p>
            <div className="sam-fm-done-act">
              {props.nextPos ? (
                <Link className="btn btn-secondary btn-sm" href={props.hasilHref}>
                  Lihat hasil
                </Link>
              ) : null}
              <button type="button" className="btn btn-ghost btn-sm" onClick={openList}>
                Daftar siswa
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="sam-who">
              <span className="sam-av">{cur.inisial}</span>
              <div className="sam-who-nm">
                <b>{cur.nama}</b>
                <span>{who}</span>
              </div>
              {cur.prev && prevName ? (
                <div className="sam-who-prev">
                  {prevName}
                  <b>{cur.prev.main}</b>
                  {cur.prev.sub}
                </div>
              ) : null}
            </div>

            {pos === "renang" ? (
              <div className="sam-gy" role="group" aria-label="Gaya renang">
                {GAYA_RENANG.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={values.renang_gaya === g}
                    className={active === "renang_gaya" && !values.renang_gaya ? "is-want" : undefined}
                    onClick={() => chooseGaya(g)}
                    disabled={locked}
                  >
                    {g}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={`sam-bigs n${pos === "tensi" || pos === "badan" ? 3 : 2}`}>
              {keyDefs.map((def) => box(def))}
              {pos === "badan" ? (
                <div className="sam-big is-auto" aria-live="polite">
                  <span className="sam-big-l">IMT</span>
                  <span className={`sam-big-v${imt === null ? " is-ph" : ""}`}>
                    <span className="sam-big-n">{imt === null ? "-" : fmt(imt, 1)}</span>
                  </span>
                  {imt !== null ? <span className="sam-big-s">{imtLabel(imt)}</span> : null}
                </div>
              ) : null}
              {showScore ? (
                <div className="sam-big is-auto" aria-live="polite">
                  <span className="sam-big-l">Nilai</span>
                  <span className={`sam-big-v${score ? "" : " is-ph"}`}>
                    <span className="sam-big-n">{score || "-"}</span>
                  </span>
                  <span className="sam-big-s">{scoreHint}</span>
                </div>
              ) : null}
            </div>

            {pos === "tensi" ? (
              <div className="sam-riw">
                <span className="sam-riw-l">Riwayat kesehatan 6 bulan</span>
                <div className="sam-gy is-two" role="group" aria-label="Riwayat kesehatan">
                  <button type="button" aria-pressed={!riwayatShown} onClick={clearRiwayat} disabled={locked}>
                    Tidak ada
                  </button>
                  <button type="button" aria-pressed={Boolean(riwayatShown)} onClick={() => setRiwayatOpen((o) => ({ ...o, [cur.id]: true }))} disabled={locked}>
                    Ada, tulis singkat
                  </button>
                </div>
                {riwayatShown
                  ? RIWAYAT.filter((k, i) => i === 0 || (values[RIWAYAT[i - 1]!] ?? "").trim() !== "" || (values[k] ?? "") !== "").map((k, i) => (
                      <input
                        key={k}
                        type="text"
                        className="sam-fm-txt"
                        value={values[k] ?? ""}
                        maxLength={120}
                        placeholder={i === 0 ? "Contoh: demam berdarah, Agustus" : "Catatan lain (opsional)"}
                        aria-label={`Riwayat kesehatan ${i + 1}, ${cur.nama}`}
                        onChange={(e) => setRiwayat(k, e.target.value)}
                        disabled={locked}
                        autoComplete="off"
                      />
                    ))
                  : null}
              </div>
            ) : null}

            {curError || curFail ? (
              <p className="sam-fm-err" role="alert">
                {curError?.message ?? curFail}
              </p>
            ) : null}
          </>
        )}

        {last && lastStudent ? (
          <div className={`sam-lastsv${lastState?.s === "error" ? " is-err" : ""}`} aria-live="polite">
            <SamIcon name={lastState?.s === "error" ? "alert" : "cloud"} />
            <span>
              {lastState?.s === "saving" ? "Menyimpan: " : lastState?.s === "error" ? "Belum tersimpan: " : last.partial ? "Tersimpan sebagian: " : "Baru tersimpan: "}
              <b>{lastStudent.nama}</b> · {lastState?.s === "error" ? lastState.message : last.brief}
            </span>
            {lastState?.s === "error" && lastStudent.id !== cur.id ? (
              <button type="button" className="sam-lastsv-go" onClick={() => goTo(students.indexOf(lastStudent))}>
                Buka
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sam-lastsv">
            <SamIcon name="cloud" />
            <span>{locked ? "Mode lihat saja. Isian tidak bisa diubah." : TIP[pos]}</span>
          </div>
        )}
      </div>

      <div className="sam-fm-pad">
        {!locked && !done ? (
          <div className="sam-kp" role="group" aria-label="Papan angka">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
              <button key={k} type="button" onClick={() => press(k)}>
                {k}
              </button>
            ))}
            <button type="button" className="is-fn" onClick={() => press("sep")} disabled={sepOff} aria-label={sepLabel === "/" ? "Garis miring" : "Koma"}>
              {sepLabel}
            </button>
            <button type="button" onClick={() => press("0")}>
              0
            </button>
            <button type="button" className="is-fn" onClick={() => press("back")} aria-label="Hapus satu angka">
              <SamIcon name="bksp" />
            </button>
          </div>
        ) : null}
        <div className="sam-fm-act">
          <button type="button" className="sam-btn is-sec" onClick={back} aria-label={done ? "Kembali ke siswa terakhir" : "Siswa sebelumnya"} disabled={!done && trail.length === 0 && index === 0}>
            <SamIcon name="left" />
          </button>
          {done ? (
            <Link className="sam-btn" href={props.nextPos?.href ?? props.hasilHref}>
              {props.nextPos ? `Pos berikutnya: ${props.nextPos.label}` : "Lihat hasil"}
              <Icon name="arrow" />
            </Link>
          ) : (
            <button type="button" className="sam-btn" onClick={main}>
              {mainLabel}
              <Icon name="arrow" />
            </button>
          )}
        </div>
        <p className="sam-fm-next">
          {upcoming ? (
            <>
              Berikutnya yang belum: <b>{upcoming.nama}</b> (no. {upcoming.no})
            </>
          ) : completeWith(cur) ? (
            "Semua siswa sudah terisi di pos ini."
          ) : (
            "Tinggal siswa ini yang belum."
          )}
        </p>
      </div>

      <dialog
        ref={listRef}
        className="sam-sheet"
        aria-label="Daftar siswa"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="sam-sheet-in">
          <div className="sam-sheet-head">
            <div>
              <h2>Daftar siswa</h2>
              <p>
                {POS_TITLE[pos]} · {filled}/{n} terisi
              </p>
            </div>
            <button type="button" className="sam-tap" onClick={() => listRef.current?.close()} aria-label="Tutup daftar">
              <SamIcon name="close" />
            </button>
          </div>
          <ul className="sam-slist">
            {students.map((s, i) => {
              const ok = completeWith(s);
              const st = status[s.id]?.s;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => pickFromList(i)} aria-current={i === index ? "true" : undefined}>
                    <span className="sam-slist-no">{s.no}</span>
                    <span className="sam-slist-nm">{s.nama}</span>
                    <span className={`sam-slist-st${st === "error" ? " is-err" : ok ? " is-ok" : ""}`}>
                      {st === "error" ? "Gagal" : ok ? <><SamIcon name="tick" />Terisi</> : "Belum"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </div>
  );
}

// ================================================================ Buat tes (lembar bawah)

export function CreateTestSheet({
  operationId,
  defaultName,
  today,
  tempat,
  startOpen = false,
  label = "Tes baru",
  className = "btn btn-secondary",
}: {
  operationId: string;
  defaultName: string;
  today: string;
  tempat: string;
  startOpen?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (startOpen && !ref.current?.open) bukaDialog(ref.current);
  }, [startOpen]);
  return (
    <>
      <button type="button" className={className} onClick={() => bukaDialog(ref.current)} aria-haspopup="dialog">
        <Icon name="plus" />
        {label}
      </button>
      <dialog
        ref={ref}
        className="sam-sheet"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="sam-sheet-in">
          <div className="sam-sheet-head">
            <div>
              <h2 id={titleId}>Buat tes baru</h2>
              <p>Semua siswa aktif otomatis jadi peserta.</p>
            </div>
            <button type="button" className="sam-tap" onClick={() => ref.current?.close()} aria-label="Tutup">
              <SamIcon name="close" />
            </button>
          </div>
          <ActionForm action={simpanTesSamapta} operationId={operationId} className="stack">
            <Field label="Nama tes" name="nama" defaultValue={defaultName} maxLength={80} />
            <div className="sam-2col">
              <Field label="Tanggal" name="tanggal" type="date" defaultValue={today} required />
              <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue="07:00" required />
            </div>
            <Field label="Tempat" name="tempat" defaultValue={tempat} maxLength={80} hint="Boleh kosong, bisa diisi nanti." />
            <Field label="Catatan" name="catatan" type="textarea" placeholder="Opsional" />
            <SubmitButton block pendingLabel="Membuat…">
              <Icon name="plus" />
              Buat tes
            </SubmitButton>
          </ActionForm>
        </div>
      </dialog>
    </>
  );
}

// ================================================================ Menu cetak blangko

export function PrintMenu({ tesId, students, defaultBlank }: { tesId: string; students: { id: string; nama: string; no: number }[]; defaultBlank: number }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(false);
  const [count, setCount] = useState(defaultBlank);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const clamp = (v: number) => Math.min(40, Math.max(1, v));
  return (
    <div className="sam-popw" ref={wrap}>
      <button type="button" className="btn" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <Icon name="print" />
        Cetak blangko
        <SamIcon name="down" />
      </button>
      {open ? (
        <div className="sam-pop" id={panelId}>
          <a className="sam-po is-main" href={`/cetak/samapta/${tesId}?siswa=semua`}>
            <span className="sam-po-ic">
              <SamIcon name="list" />
            </span>
            <span className="sam-po-main">
              <b>Semua peserta</b>
              <span>{students.length} lembar, 1 siswa per halaman</span>
            </span>
          </a>
          <button type="button" className="sam-po" aria-expanded={pick} onClick={() => setPick((v) => !v)}>
            <span className="sam-po-ic">
              <SamIcon name="tick" />
            </span>
            <span className="sam-po-main">
              <b>Pilih siswa</b>
              <span>satu blangko untuk satu siswa</span>
            </span>
            <SamIcon name={pick ? "down" : "right"} />
          </button>
          {pick ? (
            <ul className="sam-po-list">
              {students.map((s) => (
                <li key={s.id}>
                  <a href={`/cetak/samapta/${tesId}?siswa=${s.id}`}>
                    <span>{s.no}</span>
                    {s.nama}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="sam-po">
            <a className="sam-po-link" href={`/cetak/samapta/kosong?jumlah=${count}`}>
              <span className="sam-po-ic">
                <Icon name="print" />
              </span>
              <span className="sam-po-main">
                <b>Blangko kosong</b>
                <span>untuk diisi tangan</span>
              </span>
            </a>
            <span className="sam-stp" role="group" aria-label="Jumlah lembar blangko kosong">
              <button type="button" onClick={() => setCount((c) => clamp(c - 1))} aria-label="Kurangi" disabled={count <= 1}>
                -
              </button>
              <b aria-live="polite">{count}</b>
              <button type="button" onClick={() => setCount((c) => clamp(c + 1))} aria-label="Tambah" disabled={count >= 40}>
                +
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ================================================================ Tabel peringkat

export interface RankCell {
  label: string;
  value: string;
  delta: number | null;
  note?: string;
  wide?: boolean;
}

export interface RankRowData {
  id: string;
  rank: number | null;
  nama: string;
  jk: string;
  a: string;
  b: string;
  akhir: string;
  klas: Klasifikasi | null;
  delta: number | null;
  missing: string;
  cells: RankCell[];
  detailHref: string;
  printHref: string;
  firstName: string;
  /** Pesan "Kirim hasil" ke wali; null bila hasil akhir belum lengkap. */
  wa?: { nomor: string | null; pesan: string; untuk: string } | null;
}

const deltaLabel = (d: number | null) => (d === null ? "" : d > 0 ? `▲ ${fmt(d)}` : d < 0 ? `▼ ${fmt(-d)}` : "= 0");
const deltaClass = (d: number | null) => `sam-d is-${d === null || d === 0 ? "flat" : d > 0 ? "up" : "down"}`;

export function RankTable({ rows, prevName, limit = 10 }: { rows: RankRowData[]; prevName: string | null; limit?: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [all, setAll] = useState(rows.length <= limit + 2);
  const shown = all ? rows : rows.slice(0, limit);
  const toggle = (id: string) => setOpenId((v) => (v === id ? null : id));
  return (
    <section className="card sam-card sam-rank-card">
      <div className="sam-card-head">
        <div>
          <h2>Peringkat hasil akhir</h2>
          <p>Ketuk nama untuk rincian. Hasil akhir = (A + B) ÷ 2.</p>
        </div>
        {rows.length > limit + 2 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((v) => !v)} aria-expanded={all}>
            {all ? "Ringkas" : `Lihat semua ${rows.length}`}
            <SamIcon name={all ? "down" : "right"} />
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="muted small">Belum ada peserta.</p>
      ) : (
        <table className="sam-rk">
          <thead>
            <tr>
              <th>#</th>
              <th>Nama</th>
              <th className="r sam-rk-ab">A</th>
              <th className="r sam-rk-ab">B</th>
              <th className="r">Akhir</th>
              <th className="sam-rk-kl">Klasifikasi</th>
              {prevName ? <th className="r sam-rk-vs">vs {prevName}</th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const isOpen = openId === r.id;
              const panel = `rk-${r.id}`;
              return (
                <RankRows key={r.id} r={r} isOpen={isOpen} panel={panel} prevName={prevName} onToggle={() => toggle(r.id)} />
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RankRows({ r, isOpen, panel, prevName, onToggle }: { r: RankRowData; isOpen: boolean; panel: string; prevName: string | null; onToggle: () => void }) {
  const cols = prevName ? 7 : 6;
  return (
    <>
      <tr className={`${r.rank !== null && r.rank <= 3 ? "is-top" : ""}${isOpen ? " is-open" : ""}${r.rank === null ? " is-inc" : ""}`} onClick={onToggle}>
        <td>
          <span className="sam-no">{r.rank ?? "-"}</span>
        </td>
        <td className="sam-rk-nm">
          <button type="button" aria-expanded={isOpen} aria-controls={panel} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            <b>{r.nama}</b>
            <span>
              {r.jk}
              {r.missing ? ` · belum ${r.missing}` : ""}
            </span>
          </button>
        </td>
        <td className="r sam-rk-ab">{r.a}</td>
        <td className="r sam-rk-ab">{r.b}</td>
        <td className="r sam-rk-ak">{r.akhir}</td>
        <td className="sam-rk-kl">
          <span className={`badge${r.klas ? ` badge-${KLAS_TONE[r.klas]}` : ""}`}>{r.klas ?? "Belum lengkap"}</span>
        </td>
        {prevName ? (
          <td className="r sam-rk-vs">
            <span className={deltaClass(r.delta)}>{deltaLabel(r.delta) || "-"}</span>
          </td>
        ) : null}
      </tr>
      {isOpen ? (
        <tr className="sam-rk-x" id={panel}>
          <td colSpan={cols}>
            <div className="sam-xd">
              {r.cells.map((c) => (
                <div key={c.label} className={c.wide ? "is-wide" : undefined}>
                  <i>
                    {c.label}
                    {c.delta !== null ? <em className={deltaClass(c.delta)}>{deltaLabel(c.delta).replace(" ", "")}</em> : c.note ? <em>{c.note}</em> : null}
                  </i>
                  <b>{c.value}</b>
                </div>
              ))}
            </div>
            <div className="sam-xd-act">
              <span className="sam-xd-klas">
                <span className={`badge${r.klas ? ` badge-${KLAS_TONE[r.klas]}` : ""}`}>{r.klas ?? "Belum lengkap"}</span>
                {prevName && r.delta !== null ? <span className={deltaClass(r.delta)}>{deltaLabel(r.delta)} dari {prevName}</span> : null}
              </span>
              <Link className="btn btn-secondary btn-sm" href={r.detailHref}>
                <SamIcon name="edit" />
                Rincian & ubah isian
              </Link>
              <a className="btn btn-secondary btn-sm" href={r.printHref}>
                <Icon name="print" />
                Cetak blangko {r.firstName}
              </a>
              {r.wa ? <WaKabari nomor={r.wa.nomor} pesan={r.wa.pesan} untuk={r.wa.untuk} label="Kirim hasil" judul="Kirim hasil ke wali" /> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

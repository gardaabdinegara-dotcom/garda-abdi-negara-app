"use client";

// Isian Tes Samapta per pos dari HP: satu form kecil per siswa yang tersimpan sendiri-sendiri.
// - Baris tersimpan saat Enter ditekan di kolom terakhir (lalu pindah ke siswa berikutnya)
//   atau saat fokus keluar dari baris yang isiannya berubah.
// - operation_id baru dibuat setiap kali berhasil, jadi kirim ulang setelah sinyal putus tidak tercatat dua kali.
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { simpanPosSamapta } from "@/app/actions/samapta";
import { fmt, isPosComplete, normalizeDuration, normalizeTensi } from "@/app/(ruang)/samapta/samapta-ui";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { GAYA_RENANG, imtLabel, imtOf, POS_INFO, pullLabel, type Pos } from "@/lib/core/samapta";
import { Icon } from "./icon";
import { Empty } from "./ui";

export interface PosRowData {
  siswa_id: string;
  nama: string;
  kode: string;
  jk: "L" | "P" | "";
  /** Isian pos ini sudah lengkap menurut data tersimpan. */
  done: boolean;
  /** Nilai awal kolom (nama kolom = POS_INFO[pos].fields). */
  values: Record<string, string>;
  /** operation_id awal dari server. */
  opId: string;
}

interface FieldDef {
  name: string;
  label: string;
  ph: string;
  mode?: "numeric" | "decimal" | "text";
  kind?: "number" | "tensi" | "duration" | "select" | "text";
  nilai?: boolean;
  max?: number;
}

const nilaiField = (name: string): FieldDef => ({ name, label: "Nilai", ph: "0-100", mode: "decimal", kind: "number", nilai: true, max: 6 });
const jumlahField = (name: string): FieldDef => ({ name, label: "Jumlah", ph: "kali", mode: "numeric", kind: "number", max: 4 });

const FIELDS: Record<Pos, FieldDef[]> = {
  tensi: ["I", "II", "III"].map((n, i) => ({ name: `tensi_${i + 1}`, label: `Tensi ${n}`, ph: "120/80", mode: "decimal", kind: "tensi", max: 9 })),
  badan: [
    { name: "tinggi_cm", label: "Tinggi (cm)", ph: "cm", mode: "decimal", kind: "number", max: 6 },
    { name: "berat_kg", label: "Berat (kg)", ph: "kg", mode: "decimal", kind: "number", max: 6 },
  ],
  lari: [{ name: "lari_jarak", label: "Jarak (m)", ph: "meter", mode: "numeric", kind: "number", max: 5 }, nilaiField("lari_nilai")],
  pull: [jumlahField("pull_jumlah"), nilaiField("pull_nilai")],
  situp: [jumlahField("situp_jumlah"), nilaiField("situp_nilai")],
  pushup: [jumlahField("pushup_jumlah"), nilaiField("pushup_nilai")],
  shuttle: [{ name: "shuttle_waktu", label: "Waktu (dtk)", ph: "detik", mode: "decimal", kind: "number", max: 5 }, nilaiField("shuttle_nilai")],
  renang: [
    { name: "renang_gaya", label: "Gaya", ph: "", kind: "select" },
    { name: "renang_waktu", label: "Waktu", ph: "detik", mode: "decimal", kind: "duration", max: 7 },
  ],
};

const RIWAYAT: FieldDef[] = [1, 2, 3].map((i) => ({ name: `riwayat_${i}`, label: `Riwayat ${i}`, ph: "Kosongkan bila tidak ada", mode: "text", kind: "text", max: 120 }));

const snap = (values: Record<string, string>) => JSON.stringify(values);

const toNum = (text: string | undefined) => {
  const value = (text ?? "").trim().replace(",", ".");
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** Pemeriksaan cepat di HP; aturan lengkap tetap di server. */
function looksInvalid(def: FieldDef, raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  switch (def.kind) {
    case "tensi":
      return !/^\d{2,3}\/\d{2,3}$/.test(value);
    case "duration":
      return !/^\d+([.,]\d+)?$/.test(value) && !/^\d{1,2}:[0-5]?\d([.,]\d)?$/.test(value);
    case "number":
      return !/^\d+([.,]\d+)?$/.test(value);
    default:
      return false;
  }
}

function normalizeAll(pos: Pos, values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  for (const def of FIELDS[pos]) {
    const v = out[def.name] ?? "";
    out[def.name] = def.kind === "tensi" ? normalizeTensi(v) : def.kind === "duration" ? normalizeDuration(v) : v.trim();
  }
  for (const def of pos === "tensi" ? RIWAYAT : []) out[def.name] = (out[def.name] ?? "").trim();
  return out;
}

/** Server Action dibungkus agar gangguan jaringan tampil di baris, bukan halaman galat. */
async function savePos(prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    return await simpanPosSamapta(prev, formData);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String((error as { digest: unknown }).digest) : "";
    if (digest.startsWith("NEXT_")) throw error;
    return { ok: false, message: "Gagal terhubung. Periksa sinyal, lalu tekan Enter lagi.", at: Date.now() };
  }
}

const focusables = (form: HTMLFormElement) =>
  Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input:not([type=hidden]), select")).filter(
    (el) => !el.disabled && !el.closest("details:not([open])"),
  );

function focusField(el: HTMLInputElement | HTMLSelectElement, scroll = false) {
  el.focus({ preventScroll: scroll });
  if (el instanceof HTMLInputElement) el.select();
  if (scroll) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.closest("form")?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }
}

/**
 * Daftar baris isian untuk satu pos. Dengan `belum`, baris yang sudah lengkap saat halaman dibuka
 * disembunyikan; baris yang baru saja diisi tetap tampil supaya status "Tersimpan" terlihat.
 */
export function PosEntry({ tesId, pos, rows, belum, locked }: { tesId: string; pos: Pos; rows: PosRowData[]; belum: boolean; locked: boolean }) {
  const [shown] = useState(() => new Set(rows.filter((r) => !belum || !r.done).map((r) => r.siswa_id)));
  const visible = rows.filter((r) => shown.has(r.siswa_id));
  if (visible.length === 0) {
    return (
      <div className="card">
        <Empty title={rows.length ? "Semua sudah terisi" : "Belum ada peserta"}>
          {rows.length ? "Semua peserta sudah lengkap di pos ini." : "Tambahkan peserta di tab Data tes."}
        </Empty>
      </div>
    );
  }
  return (
    <div className="sam-list">
      {visible.map((row) => (
        <PosRow key={row.siswa_id} tesId={tesId} pos={pos} row={row} locked={locked} />
      ))}
    </div>
  );
}

type Status = { tone: "ok" | "saving" | "error" | "warn" | "muted"; text: string };

function PosRow({ tesId, pos, row, locked }: { tesId: string; pos: Pos; row: PosRowData; locked: boolean }) {
  const [state, dispatch, pending] = useActionState(savePos, initialActionState);
  const [values, setValues] = useState(row.values);
  const [savedSnap, setSavedSnap] = useState(() => snap(row.values));
  const [outcome, setOutcome] = useState<"idle" | "ok" | "error">("idle");
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const valuesRef = useRef(row.values);
  const savedRef = useRef(snap(row.values));
  const sentRef = useRef(snap(row.values));
  const opId = useRef(row.opId);
  const inflight = useRef(false);
  const queued = useRef(false);
  const handled = useRef<number | undefined>(undefined);
  // Riwayat terbuka sejak awal bila sudah ada isinya; setelah itu diatur sendiri oleh pengguna.
  const [riwayatOpen] = useState(() => RIWAYAT.some((def) => (row.values[def.name] ?? "").trim() !== ""));

  function update(next: Record<string, string>) {
    valuesRef.current = next;
    setValues(next);
  }

  function markSaved(s: string) {
    savedRef.current = s;
    setSavedSnap(s);
  }

  function send(force: boolean) {
    if (locked) return;
    const current = normalizeAll(pos, valuesRef.current);
    const s = snap(current);
    if (s !== snap(valuesRef.current)) update(current);
    if (!force && s === sentRef.current) return;
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    sentRef.current = s;
    const formData = new FormData();
    formData.set("operation_id", opId.current);
    formData.set("tes_id", tesId);
    formData.set("siswa_id", row.siswa_id);
    formData.set("pos", pos);
    for (const [key, value] of Object.entries(current)) formData.set(key, value);
    startTransition(() => dispatch(formData));
  }

  // Hasil simpan: operation_id baru bila berhasil, lalu kirim isian yang sempat diketik selama menyimpan.
  useEffect(() => {
    if (!state.at || state.at === handled.current) return;
    handled.current = state.at;
    inflight.current = false;
    if (state.ok) {
      opId.current = crypto.randomUUID();
      markSaved(sentRef.current);
      setOutcome("ok");
    } else {
      setErrorFor(sentRef.current);
      setOutcome("error");
    }
    if (queued.current) {
      queued.current = false;
      send(false);
    }
    // send memakai ref, jadi cukup bergantung pada state.
  }, [state]);

  // Data dari server berubah (mis. diisi dari HP lain, atau dirapikan server: "65" → "1:05"):
  // ikuti bila baris ini tidak sedang diubah.
  useEffect(() => {
    const incoming = snap(row.values);
    if (inflight.current || snap(valuesRef.current) !== savedRef.current || incoming === savedRef.current) return;
    update(row.values);
    markSaved(incoming);
    sentRef.current = incoming;
  }, [row.values]);

  const current = snap(values);
  const dirty = current !== savedSnap;
  const complete = isPosComplete(pos, values);
  const showError = outcome === "error" && errorFor === current;
  const fieldErrors = showError ? (state.errors ?? {}) : {};

  let status: Status;
  if (pending) status = { tone: "saving", text: "Menyimpan…" };
  else if (showError) status = { tone: "error", text: "Belum tersimpan" };
  else if (dirty && !locked) status = { tone: "warn", text: "Belum disimpan" };
  else if (outcome === "ok") status = complete ? { tone: "ok", text: "Tersimpan" } : { tone: "ok", text: "Tersimpan, belum lengkap" };
  else status = row.done ? { tone: "ok", text: "Lengkap" } : { tone: "muted", text: "Belum diisi" };

  function setField(name: string, value: string) {
    update({ ...valuesRef.current, [name]: value });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    event.preventDefault();
    const form = event.currentTarget;
    const fields = focusables(form);
    const index = fields.indexOf(target);
    if (index >= 0 && index < fields.length - 1) {
      focusField(fields[index + 1]!);
      return;
    }
    send(true);
    const forms = Array.from(form.closest(".sam-list")?.querySelectorAll<HTMLFormElement>("form.sam-row") ?? []);
    const next = forms[forms.indexOf(form) + 1];
    const first = next ? focusables(next)[0] : undefined;
    if (first) focusField(first, true);
    else target.blur();
  }

  function onBlur(event: React.FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    send(false);
  }

  const who = `${row.nama} (${row.kode})`;
  const riwayatCount = RIWAYAT.filter((def) => (values[def.name] ?? "").trim() !== "").length;
  const cell = (def: FieldDef) => (
    <Cell key={def.name} def={def} value={values[def.name] ?? ""} who={who} serverError={Boolean(fieldErrors[def.name])} onChange={(v) => setField(def.name, v)} />
  );

  return (
    <form
      className={`sam-row k-${pos}${row.done && !dirty ? " is-done" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        send(true);
      }}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      noValidate
      aria-label={`${POS_INFO[pos].short}: ${who}`}
    >
      <div className="sam-who">
        <b>{row.nama}</b>
        <small>
          {row.kode} · {row.jk === "P" ? "putri" : row.jk === "L" ? "putra" : "-"}
          {pos === "pull" ? ` · ${pullLabel(row.jk)}` : ""}
        </small>
        <small className={`sam-st is-${status.tone}`} aria-live="polite">
          {status.tone === "ok" ? <Icon name="check" className="icon sam-st-icon" /> : null}
          {status.text}
        </small>
      </div>
      <fieldset className="sam-ins" disabled={locked}>
        <legend className="sr-only">
          {POS_INFO[pos].label}, {who}
        </legend>
        {FIELDS[pos].map(cell)}
        {pos === "badan" ? <ImtOut tinggi={values.tinggi_cm} berat={values.berat_kg} /> : null}
      </fieldset>
      {pos === "tensi" ? (
        <details className="sam-riwayat" open={riwayatOpen || undefined}>
          <summary>
            Riwayat kesehatan 6 bulan
            <span className="muted">{riwayatCount ? ` · ${riwayatCount} catatan` : " · bila ada"}</span>
          </summary>
          <fieldset className="sam-ins sam-ins-wide" disabled={locked}>
            <legend className="sr-only">Riwayat kesehatan, {who}</legend>
            {RIWAYAT.map(cell)}
          </fieldset>
        </details>
      ) : null}
      {showError ? (
        <p className="sam-err" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function Cell({ def, value, who, serverError, onChange }: { def: FieldDef; value: string; who: string; serverError: boolean; onChange: (value: string) => void }) {
  if (def.kind === "select") {
    return (
      <label className="sam-in is-select">
        <span>{def.label}</span>
        <select name={def.name} value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${def.label}, ${who}`}>
          <option value="">Pilih</option>
          {GAYA_RENANG.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
    );
  }
  const invalid = serverError || looksInvalid(def, value);
  return (
    <label className={`sam-in${def.nilai ? " is-nilai" : ""}${def.kind === "text" ? " is-wide" : ""}`}>
      <span>{def.label}</span>
      <input
        type="text"
        name={def.name}
        value={value}
        inputMode={def.mode}
        enterKeyHint="next"
        autoComplete="off"
        maxLength={def.max}
        placeholder={def.ph}
        aria-label={`${def.label}, ${who}`}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const raw = e.target.value;
          const fixed = def.kind === "tensi" ? normalizeTensi(raw) : def.kind === "duration" ? normalizeDuration(raw) : raw;
          if (fixed !== raw) onChange(fixed);
        }}
      />
    </label>
  );
}

function ImtOut({ tinggi, berat }: { tinggi?: string; berat?: string }) {
  const t = toNum(tinggi);
  const b = toNum(berat);
  const imt = t !== null && b !== null && t >= 100 && t <= 230 && b >= 25 && b <= 200 ? imtOf(t, b) : null;
  return (
    <div className="sam-in">
      <span>IMT</span>
      <output className="sam-out" aria-live="polite">
        {imt !== null ? (
          <>
            <b>{fmt(imt, 1)}</b>
            <small>{imtLabel(imt)}</small>
          </>
        ) : (
          <small>-</small>
        )}
      </output>
    </div>
  );
}

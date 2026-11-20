"use client";

// Layar Presensi (opsi A "Layar hari ini"): bagian yang interaktif.
// Kartu siswa, pengajuan, dan angka di kartu sesi berbagi satu keadaan agar perubahan langsung terlihat
// (optimistis) sebelum server selesai menyimpan. Semua warna dan ukuran lewat kelas CSS; tidak ada style inline (CSP).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ajukanPresensi, catatPresensi, hapusSesi, sahkanPresensi, simpanSesi, ubahStatusSesi } from "@/app/actions/akademik";
import { initialActionState, type ActionState } from "@/lib/action-state";
import {
  addDays,
  daysBetween,
  describeWeekdays,
  isLate,
  isoWeekday,
  SERIES_MAX_DAYS,
  SERIES_MAX_SESSIONS,
  seriesDates,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  WEEKDAYS,
  type AttendanceStatus,
  type SessionStatus,
} from "@/lib/core/akademik";
import { UJI_SISWA_FIELD } from "@/lib/core/uji-siswa";
import { initials } from "@/lib/format";
import { ActionForm, Field, SubmitButton, useFieldError } from "./form";
import { useUjiSiswaId } from "./uji-siswa-context";
import { addMinutes, fmtTime, nowTime, shortName } from "./presensi-format";
import { PrIcon } from "./presensi-icons";
import { dayMonth } from "./presensi-tanggal";
import { bukaDialog } from "@/lib/dialog";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Mark = "HADIR" | "IZIN" | "SAKIT" | "ALFA" | "KOSONG";

/** UUID v4 untuk ID operasi; tetap jalan di alamat http biasa (tanpa crypto.randomUUID). */
export function newOperationId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Menjalankan Server Action dari tombol (bukan form). Hanya untuk aksi yang tidak mengalihkan halaman. */
async function run(action: Action, fields: Record<string, string>): Promise<ActionState> {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("operation_id", newOperationId());
  try {
    return await action(initialActionState, data);
  } catch {
    return { ok: false, message: "Koneksi terputus. Periksa internet lalu coba lagi." };
  }
}

// ---------------------------------------------------------------- Lembar bawah (HP) / panel samping (desktop)

export function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) bukaDialog(dialog);
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="pr-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pr-sheet-in">
        <div className="pr-sheet-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {sub ? <p>{sub}</p> : null}
          </div>
          <button type="button" className="pr-x" aria-label="Tutup" onClick={onClose}>
            <PrIcon name="x" />
          </button>
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}

/** Isian sesi bisa mengganti label tombol simpan, mis. "Simpan 24 sesi" saat Ulangi aktif. */
const SubmitLabelContext = createContext<(label: string | null) => void>(() => {});

/** Form sesi (tambah/ubah) di dalam lembar. Isian dikirim dari server sebagai children. */
function SessionForm({ children, operationId, submitLabel, onDone }: { children: React.ReactNode; operationId: string; submitLabel: string; onDone: (message: string) => void }) {
  const [label, setLabel] = useState<string | null>(null);
  const action = useCallback(
    async (prev: ActionState, data: FormData) => {
      const result = await simpanSesi(prev, data);
      if (result.ok) onDone(result.message);
      return result;
    },
    [onDone],
  );
  return (
    <SubmitLabelContext value={setLabel}>
      <ActionForm action={action} operationId={operationId} className="stack pr-form">
        {children}
        <div className="form-actions">
          <SubmitButton>{label ?? submitLabel}</SubmitButton>
        </div>
      </ActionForm>
    </SubmitLabelContext>
  );
}

// ---------------------------------------------------------------- Isian sesi dan Ulangi (sesi berulang)

/** Ikon panah berputar untuk sesi berulang. */
export function RepeatIc({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <svg className={`pr-ic pr-ic-${size}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M17 2.5l3.5 3.5L17 9.5M20.5 6H8a4.5 4.5 0 0 0-4.5 4.5V12M7 21.5L3.5 18 7 14.5M3.5 18H16a4.5 4.5 0 0 0 4.5-4.5V12" />
    </svg>
  );
}

export interface SessionFieldsProps {
  classes: { kelas_id: string; nama_kelas: string }[];
  teachers: { user_id: string; nama: string }[];
  /** Pilihan bidang; bidang sesi yang sedang diubah sudah ikut di dalamnya walau disembunyikan. */
  sessionTypes: { value: string; label: string }[];
  session?: { nama: string; tanggal: string; jam_mulai: string; jam_selesai: string; jenis: string; kelas_id: string; pengajar_id: string };
  date: string;
  /** Diisi saat membuat sesi baru: menampilkan sakelar Ulangi. */
  today?: string;
}

interface SeriesPlan {
  dates: string[];
  past: number;
  error: string | null;
}

function planSeries(start: string, end: string, days: number[], today: string): SeriesPlan {
  if (!start || !end) return { dates: [], past: 0, error: "Isi tanggal mulai dan sampai tanggal." };
  if (end < start) return { dates: [], past: 0, error: "Sampai tanggal harus sama dengan atau sesudah tanggal mulai." };
  if (daysBetween(start, end) > SERIES_MAX_DAYS) return { dates: [], past: 0, error: `Rentang paling panjang ${SERIES_MAX_DAYS} hari (sekitar 3 bulan).` };
  if (days.length === 0) return { dates: [], past: 0, error: "Pilih minimal satu hari." };
  const all = seriesDates(start, end, days);
  const dates = all.filter((d) => d >= today);
  if (all.length === 0) return { dates, past: 0, error: "Tidak ada tanggal yang jatuh pada hari terpilih." };
  if (dates.length === 0) return { dates, past: all.length, error: "Semua tanggal itu sudah lewat." };
  if (dates.length > SERIES_MAX_SESSIONS) return { dates, past: all.length - dates.length, error: `Paling banyak ${SERIES_MAX_SESSIONS} sesi sekali buat (terpilih ${dates.length}). Perpendek rentang atau kurangi hari.` };
  return { dates, past: all.length - dates.length, error: null };
}

/** Isian sesi untuk tambah dan ubah. Saat menambah, sakelar Ulangi membuat satu seri sesi sekaligus. */
export function SessionFieldsClient({ classes, teachers, sessionTypes, session, date, today }: SessionFieldsProps) {
  const repeatable = !session && Boolean(today);
  const [times, setTimes] = useState({ tanggal: session?.tanggal ?? date, jam_mulai: session?.jam_mulai ?? "07:00", jam_selesai: session?.jam_selesai ?? "09:00" });
  const [ulangi, setUlangi] = useState(false);

  return (
    <div
      className="stack pr-sfields"
      onChange={(event) => {
        const el = event.target as HTMLInputElement;
        if (el.name === "tanggal" || el.name === "jam_mulai" || el.name === "jam_selesai") setTimes((v) => ({ ...v, [el.name]: el.value }));
      }}
    >
      <div className="form-grid two">
        <Field label="Nama kegiatan" name="nama" defaultValue={session?.nama} placeholder="mis. Latihan jasmani pagi" required className="span-all" />
        <Field label={ulangi ? "Tanggal mulai" : "Tanggal"} name="tanggal" type="date" defaultValue={session?.tanggal ?? date} required />
        <Field label="Bidang" name="jenis" type="select" defaultValue={session?.jenis ?? (sessionTypes.some((o) => o.value === "FISIK") ? "FISIK" : sessionTypes[0]?.value)} options={sessionTypes} />
        <Field label="Jam mulai" name="jam_mulai" type="time" defaultValue={session?.jam_mulai ?? "07:00"} required />
        <Field label="Jam selesai" name="jam_selesai" type="time" defaultValue={session?.jam_selesai ?? "09:00"} required />
        <Field
          label="Peserta"
          name="kelas_id"
          type="select"
          defaultValue={session?.kelas_id ?? ""}
          options={[{ value: "", label: "Semua siswa aktif" }, ...classes.map((c) => ({ value: c.kelas_id, label: `Kelas ${c.nama_kelas}` }))]}
          hint="Peserta dibekukan saat sesi dibuka."
        />
        {teachers.length ? (
          <Field
            label="Pengajar"
            name="pengajar_id"
            type="select"
            defaultValue={session?.pengajar_id ?? ""}
            options={[{ value: "", label: "Saya sendiri" }, ...teachers.map((t) => ({ value: t.user_id, label: t.nama }))]}
            hint="Pengajar harus sudah ditautkan ke kelas yang dipilih."
          />
        ) : null}
      </div>
      {repeatable ? <RepeatBlock on={ulangi} onToggle={setUlangi} start={times.tanggal} jamMulai={times.jam_mulai} jamSelesai={times.jam_selesai} today={today!} /> : null}
    </div>
  );
}

function RepeatBlock({
  on,
  onToggle,
  start,
  jamMulai,
  jamSelesai,
  today,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  start: string;
  jamMulai: string;
  jamSelesai: string;
  today: string;
}) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [end, setEnd] = useState(() => addDays(start || today, 27));
  const setLabel = useContext(SubmitLabelContext);
  const endId = useId();
  const hariError = useFieldError("hari");
  const sampaiError = useFieldError("sampai");
  const plan = useMemo(() => (on ? planSeries(start, end, days, today) : null), [on, start, end, days, today]);
  const count = plan && !plan.error ? plan.dates.length : 0;

  useEffect(() => {
    setLabel(on && count ? `Simpan ${count} sesi` : null);
  }, [on, count, setLabel]);
  useEffect(() => () => setLabel(null), [setLabel]);

  // Selama "Sampai tanggal" belum diubah sendiri, ia mengikuti tanggal mulai (empat minggu).
  // Bila tanggal mulai digeser melewatinya, ia ikut bergeser.
  const [endTouched, setEndTouched] = useState(false);
  const [lastStart, setLastStart] = useState(start);
  if (start !== lastStart) {
    setLastStart(start);
    if (start && (!endTouched || end < start)) setEnd(addDays(start, 27));
  }

  const toggleDay = (day: number) => setDays((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort((a, b) => a - b)));

  return (
    <div className={`pr-rep${on ? " on" : ""}`}>
      <label className="pr-rep-h">
        <span className="pr-rep-ic">
          <RepeatIc size="md" />
        </span>
        <span className="pr-main">
          <b>Ulangi</b>
          <span>Buat banyak sesi sekaligus</span>
        </span>
        <input type="checkbox" role="switch" name="ulangi" className="pr-switch" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-describedby={on ? "pr-rep-sum" : undefined} />
      </label>
      {on ? (
        <>
          <fieldset className="pr-days" aria-invalid={hariError ? true : undefined}>
            <legend className="sr-only">Ulangi pada hari</legend>
            {WEEKDAYS.map((day) => (
              <label key={day} title={WEEKDAY_LONG[day]}>
                <input type="checkbox" name="hari" value={day} checked={days.includes(day)} onChange={() => toggleDay(day)} />
                <span>{WEEKDAY_SHORT[day]}</span>
              </label>
            ))}
          </fieldset>
          {hariError ? <span className="field-error">{hariError}</span> : null}
          <div className="field">
            <label htmlFor={endId}>
              Sampai tanggal<span className="muted"> *</span>
            </label>
            <input id={endId} type="date" name="sampai" value={end} min={start || undefined} onChange={(e) => {
                setEndTouched(true);
                setEnd(e.target.value);
              }}
              required aria-invalid={sampaiError ? true : undefined} />
            {sampaiError ? <span className="field-error">{sampaiError}</span> : null}
          </div>
          <div className={`pr-sum${plan?.error ? " err" : ""}`} id="pr-rep-sum" aria-live="polite">
            <div className="pr-sum-t">
              <PrIcon name="cal" size="sm" />
              {plan?.error ? (
                <span>
                  <b>Belum bisa dibuat</b>
                  {plan.error}
                </span>
              ) : plan ? (
                <span className="n">
                  <b>{plan.dates.length} sesi akan dibuat</b>
                  {dayMonth(plan.dates[0]!)} sampai {dayMonth(plan.dates[plan.dates.length - 1]!)} · {describeWeekdays(days)} · {fmtTime(jamMulai)} sampai {fmtTime(jamSelesai)}
                  {plan.past ? ` · ${plan.past} tanggal yang sudah lewat tidak dibuat` : ""}
                </span>
              ) : null}
            </div>
            {plan && !plan.error ? <MiniCalendar start={start} end={end} picked={new Set(plan.dates)} /> : null}
          </div>
          <p className="pr-xs pr-muted">Tanggal yang sudah punya sesi dengan nama dan jam mulai yang sama dilewati. Tiap sesi tetap bisa diubah atau dihapus sendiri.</p>
        </>
      ) : null}
    </div>
  );
}

/** Kalender kecil seri (sampai 6 minggu): tanggal terpilih ditandai, hari yang tidak dipilih dicoret. */
function MiniCalendar({ start, end, picked }: { start: string; end: string; picked: ReadonlySet<string> }) {
  const first = addDays(start, 1 - isoWeekday(start));
  const last = addDays(end, 7 - isoWeekday(end));
  const weeks = (daysBetween(first, last) + 1) / 7;
  if (weeks > 6) return null;
  const cells: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  return (
    <div className="pr-cal" aria-hidden="true">
      {WEEKDAYS.map((day) => (
        <span key={day} className="dw">
          {WEEKDAY_SHORT[day]}
        </span>
      ))}
      {cells.map((d) => {
        const inRange = d >= start && d <= end;
        const dayNum = Number(d.slice(8));
        return (
          <i key={d} className={!inRange ? "out" : picked.has(d) ? "on" : "off"}>
            {inRange ? dayNum : ""}
            {inRange && dayNum === 1 && d !== start ? <small> {dayMonth(d).split(" ")[1]}</small> : null}
          </i>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Deretan geser (chip sesi)

/**
 * Deretan yang bisa digeser ke samping. Item aktif (aria-current) digulir agar terlihat, dan tepi
 * yang masih menyimpan item lain diberi efek pudar.
 */
export function ScrollRow({ className, label, current, children }: { className: string; label: string; current?: string | null; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [fade, setFade] = useState("");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>("[aria-current]");
    if (active && el.scrollWidth > el.clientWidth) {
      // Geser seperlunya agar item aktif terlihat utuh (dengan sedikit ruang), tanpa memotong item pertama.
      // Hanya digeser bila item aktif terpotong; saat digeser, sisakan ruang selebar efek pudar.
      const padLeft = 40;
      const padRight = 56;
      const left = active.offsetLeft;
      const right = left + active.offsetWidth;
      if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - padLeft);
      else if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right + padRight - el.clientWidth;
    }
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setFade([el.scrollLeft > 2 ? "l" : "", el.scrollLeft < max - 2 ? "r" : ""].filter(Boolean).join(" "));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [current]);
  return (
    <nav ref={ref} className={className} aria-label={label} data-fade={fade || undefined}>
      {children}
    </nav>
  );
}

/** Tombol "+ Buat sesi" di kepala halaman beserta lembarnya. */
export function CreateSession({ children, operationId }: { children: React.ReactNode; operationId: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="pr-create" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <PrIcon name="plus" />
        <span>Buat sesi</span>
      </button>
      <Sheet open={open} onClose={close} title="Buat sesi" sub="Buka sesi pada harinya agar siswa bisa presensi.">
        <SessionForm operationId={operationId} submitLabel="Simpan sesi" onDone={close}>
          {children}
        </SessionForm>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- Keadaan bersama satu sesi

export interface RosterItem {
  id: string;
  nama: string;
  kode: string;
  status: AttendanceStatus;
  diajukan: "" | "HADIR" | "IZIN" | "SAKIT";
  waktu: string;
  terlambat: boolean;
  catatan: string;
  metode: string;
}

export interface SessionMeta {
  id: string;
  nama: string;
  status: SessionStatus;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  /** Boleh mencatat/mengubah presensi (pengajar sesi atau admin, sesi tidak batal, sudah harinya). */
  editable: boolean;
  /** Pengajuan hanya bisa disahkan saat sesi berlangsung. */
  canApprove: boolean;
  /** Peserta sudah dibekukan (sesi pernah dibuka). */
  frozen: boolean;
  toleransi: number;
  zona: string;
}

type Patch = Partial<Pick<RosterItem, "status" | "waktu" | "terlambat" | "catatan">>;
interface Override {
  patch: Patch;
  seq: number;
  settled: boolean;
}

interface Live {
  meta: SessionMeta;
  items: RosterItem[];
  busy: Readonly<Record<string, number>>;
  errors: Readonly<Record<string, string>>;
  notice: string;
  mark(id: string, status: Mark, extra?: { waktu?: string; catatan?: string }): Promise<ActionState>;
  approve(id: string | null): Promise<ActionState>;
  reject(id: string): Promise<ActionState>;
  openDetail(id: string): void;
}

const LiveContext = createContext<Live | null>(null);

function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error("Komponen presensi harus berada di dalam PresensiLive.");
  return live;
}

const omit = <T,>(record: Readonly<Record<string, T>>, ids: string[]) => {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
};

const matches = (item: RosterItem | undefined, patch: Patch) => Boolean(item && Object.entries(patch).every(([key, value]) => item[key as keyof RosterItem] === value));

/** Penyedia keadaan satu sesi: daftar peserta dari server + perubahan yang sedang/baru disimpan. */
export function PresensiLive({ meta, items: base, children }: { meta: SessionMeta; items: RosterItem[]; children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const seq = useRef(0);
  const baseRef = useRef(base);
  baseRef.current = base;

  // Data baru dari server: perubahan yang sudah tersimpan tidak perlu ditimpa lagi.
  useEffect(() => {
    setOverrides((current) => {
      const kept = Object.entries(current).filter(([, o]) => !o.settled);
      return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
    });
  }, [base]);

  const items = useMemo(() => base.map((item) => (overrides[item.id] ? { ...item, ...overrides[item.id]!.patch } : item)), [base, overrides]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const perform = useCallback(async (ids: string[], patchFor: (item: RosterItem) => Patch, call: () => Promise<ActionState>) => {
    const entries = ids.flatMap((id) => {
      const item = itemsRef.current.find((i) => i.id === id);
      return item ? [[id, { patch: patchFor(item), seq: ++seq.current, settled: false }] as const] : [];
    });
    setErrors((e) => omit(e, ids));
    setNotice("");
    setOverrides((current) => ({ ...current, ...Object.fromEntries(entries) }));
    setBusy((current) => {
      const next = { ...current };
      for (const id of ids) next[id] = (next[id] ?? 0) + 1;
      return next;
    });
    const result = await call();
    setBusy((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = (next[id] ?? 1) - 1;
        if (next[id]! <= 0) delete next[id];
      }
      return next;
    });
    setOverrides((current) => {
      const next = { ...current };
      for (const [id, entry] of entries) {
        if (next[id]?.seq !== entry.seq) continue;
        const server = baseRef.current.find((i) => i.id === id);
        if (!result.ok || matches(server, entry.patch)) delete next[id];
        else next[id] = { ...entry, settled: true };
      }
      return next;
    });
    if (!result.ok) {
      setErrors((e) => ({ ...e, ...Object.fromEntries(ids.map((id) => [id, result.message])) }));
      const name = ids.length === 1 ? itemsRef.current.find((i) => i.id === ids[0])?.nama : null;
      setNotice(name ? `${name}: ${result.message}` : result.message);
    }
    return result;
  }, []);

  const mark = useCallback(
    (id: string, status: Mark, extra: { waktu?: string; catatan?: string } = {}) =>
      perform(
        [id],
        (item) => {
          const waktu = status === "KOSONG" ? "" : extra.waktu || item.waktu || nowTime(meta.zona);
          return { status, waktu, terlambat: status === "HADIR" && isLate(waktu, meta.jamMulai, meta.toleransi), catatan: extra.catatan || item.catatan };
        },
        () => run(catatPresensi, { sesi_id: meta.id, siswa_id: id, status, waktu: extra.waktu ?? "", catatan: extra.catatan ?? "" }),
      ),
    [meta, perform],
  );

  const approve = useCallback(
    (id: string | null) => {
      const ids = id ? [id] : itemsRef.current.filter((i) => i.status === "MENUNGGU").map((i) => i.id);
      return perform(ids, (item) => ({ status: item.diajukan || "HADIR" }), () => run(sahkanPresensi, { sesi_id: meta.id, siswa_id: id ?? "" }));
    },
    [meta.id, perform],
  );

  const reject = useCallback(
    (id: string) =>
      perform([id], () => ({ status: "KOSONG", waktu: "", terlambat: false }), () => run(catatPresensi, { sesi_id: meta.id, siswa_id: id, status: "KOSONG", waktu: "", catatan: "" })),
    [meta.id, perform],
  );

  const value = useMemo<Live>(() => ({ meta, items, busy, errors, notice, mark, approve, reject, openDetail: setDetail }), [meta, items, busy, errors, notice, mark, approve, reject]);
  const current = detail ? items.find((i) => i.id === detail) : undefined;

  return (
    <LiveContext value={value}>
      {children}
      <Sheet open={Boolean(current)} onClose={() => setDetail(null)} title={current?.nama ?? "Siswa"} sub={current ? `${current.kode} · ${statusWord(current, meta.status === "SELESAI")}` : undefined}>
        {current ? <StudentDetail key={current.id} item={current} onDone={() => setDetail(null)} /> : null}
      </Sheet>
    </LiveContext>
  );
}

// ---------------------------------------------------------------- Tampilan status

interface View {
  cls: string;
  badge: React.ReactNode;
  sub: string;
}

function viewOf(item: RosterItem, ended: boolean): View {
  switch (item.status) {
    case "MENUNGGU":
      return { cls: "s-tunggu", badge: "?", sub: item.diajukan === "IZIN" ? "Minta izin" : item.diajukan === "SAKIT" ? "Minta sakit" : "Menunggu" };
    case "HADIR":
      return item.terlambat
        ? { cls: "s-telat", badge: "T", sub: item.waktu ? `Telat ${fmtTime(item.waktu)}` : "Telat" }
        : { cls: "s-hadir", badge: <PrIcon name="ok" size="sm" />, sub: item.waktu ? fmtTime(item.waktu) : "Hadir" };
    case "IZIN":
      return { cls: "s-izin", badge: "I", sub: "Izin" };
    case "SAKIT":
      return { cls: "s-sakit", badge: "S", sub: "Sakit" };
    case "ALFA":
      return { cls: "s-alfa", badge: "A", sub: "Alfa" };
    default:
      return ended ? { cls: "s-alfa s-kosong", badge: "A", sub: "Alfa" } : { cls: "s-belum", badge: null, sub: "Belum" };
  }
}

function statusWord(item: RosterItem, ended: boolean): string {
  switch (item.status) {
    case "MENUNGGU":
      return item.diajukan === "HADIR" || !item.diajukan ? "menunggu disahkan" : `minta ${item.diajukan === "IZIN" ? "izin" : "sakit"}, menunggu disahkan`;
    case "HADIR":
      return item.terlambat ? `hadir, terlambat ${fmtTime(item.waktu)}` : item.waktu ? `hadir ${fmtTime(item.waktu)}` : "hadir";
    case "IZIN":
      return "izin";
    case "SAKIT":
      return "sakit";
    case "ALFA":
      return "alfa";
    default:
      return ended ? "tanpa catatan (alfa)" : "belum tercatat";
  }
}

const LABEL: Record<Mark, string> = { HADIR: "Hadir", IZIN: "Izin", SAKIT: "Sakit", ALFA: "Alfa", KOSONG: "Belum" };

/** Urutan ketukan: Belum → Hadir → Izin → Sakit → Alfa → Belum. Sesi selesai tidak kembali ke Belum. */
function nextMark(status: AttendanceStatus, ended: boolean): Mark {
  const cycle: Mark[] = ended ? ["HADIR", "IZIN", "SAKIT", "ALFA"] : ["KOSONG", "HADIR", "IZIN", "SAKIT", "ALFA"];
  const from = status === "KOSONG" && ended ? "ALFA" : status;
  const index = cycle.indexOf(from as Mark);
  return cycle[(index + 1) % cycle.length]!;
}

function counts(items: RosterItem[], ended: boolean) {
  const c = { total: items.length, hadir: 0, telat: 0, menunggu: 0, belum: 0, izin: 0, sakit: 0, alfa: 0 };
  for (const item of items) {
    if (item.status === "HADIR") {
      c.hadir += 1;
      if (item.terlambat) c.telat += 1;
    } else if (item.status === "MENUNGGU") c.menunggu += 1;
    else if (item.status === "IZIN") c.izin += 1;
    else if (item.status === "SAKIT") c.sakit += 1;
    else if (item.status === "ALFA" || ended) c.alfa += 1;
    else c.belum += 1;
  }
  return c;
}

/** Batang hadir/menunggu. Lebar lewat atribut SVG, bukan style inline. */
function Bar({ parts, label, className = "pr-hbar" }: { parts: { value: number; cls: string }[]; label: string; className?: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  let x = 0;
  return (
    <svg className={className} viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={label}>
      <rect className="trk" x="0" y="0" width="100" height="8" />
      {total > 0
        ? parts.map((p) => {
            const w = (p.value / Math.max(total, 1)) * 100;
            const rect = <rect key={p.cls} className={p.cls} x={x} y="0" width={w} height="8" />;
            x += w;
            return rect;
          })
        : null}
    </svg>
  );
}

/** Angka di kartu sesi: Hadir, Menunggu, Belum (+ Izin/sakit), atau rekap sesi yang sudah selesai. */
export function LiveCounters({ variant = "hero" }: { variant?: "hero" | "qr" }) {
  const { items, meta } = useLive();
  const ended = meta.status === "SELESAI";
  const c = counts(items, ended);
  const other = c.izin + c.sakit;
  const boxes = ended
    ? [
        { key: "h", n: c.hadir, dot: "h", label: c.telat ? `Hadir · ${c.telat} telat` : "Hadir" },
        { key: "i", n: other, dot: "s", label: "Izin · sakit" },
        { key: "a", n: c.alfa, dot: "a", label: "Alfa" },
      ]
    : [
        { key: "h", n: c.hadir, dot: "h", label: "Hadir", extra: c.telat ? ` · ${c.telat} telat` : "" },
        { key: "w", n: c.menunggu, dot: "w", label: "Menunggu" },
        { key: "b", n: c.belum, dot: "", label: "Belum" },
        ...(variant === "hero" ? [{ key: "o", n: other + c.alfa, dot: "", label: c.alfa ? "Izin · sakit · alfa" : "Izin · sakit", opt: other + c.alfa === 0 }] : []),
      ];
  const total = Math.max(c.total, 1);
  return (
    <>
      <div className={`pr-cnt${variant === "qr" ? " pr-qcnt" : ""}`}>
        {boxes.map((box) => (
          <div key={box.key} className={"opt" in box && box.opt ? "pr-opt" : undefined}>
            <b className="n">{box.n}</b>
            <span>
              {box.dot !== undefined && box.key !== "o" ? <i className={`d ${box.dot}`} /> : null}
              {box.label}
              {"extra" in box && box.extra ? <em className="pr-dk-only">{box.extra}</em> : null}
            </span>
          </div>
        ))}
      </div>
      {variant === "hero" ? (
        <Bar
          parts={
            ended
              ? [
                  { value: c.hadir, cls: "h" },
                  { value: other, cls: "s" },
                  { value: total - c.hadir - other, cls: "rest" },
                ]
              : [
                  { value: c.hadir, cls: "h" },
                  { value: c.menunggu, cls: "w" },
                  { value: total - c.hadir - c.menunggu, cls: "rest" },
                ]
          }
          label={`${c.hadir} dari ${c.total} hadir${c.menunggu ? `, ${c.menunggu} menunggu` : ""}`}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Tombol di kartu sesi

/**
 * Tanpa ?sesi= di alamat, server memilih sesi otomatis (yang berlangsung dulu). Setelah sesi ditutup atau dibuka,
 * pilihan otomatis bisa pindah ke sesi lain; jadi sesi ini dikunci di alamat sebelum statusnya diubah.
 */
function pinSelection(id: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("sesi") === id) return;
  url.searchParams.set("sesi", id);
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

export function HeroActions({
  isToday,
  isAdmin,
  canManage,
  qrHref,
  rotateLabel,
  editFields,
  editOperationId,
  deleteOperationId,
  series = null,
}: {
  isToday: boolean;
  isAdmin: boolean;
  canManage: boolean;
  qrHref: string | null;
  rotateLabel?: string;
  editFields: React.ReactNode | null;
  editOperationId: string;
  deleteOperationId: string;
  /** Sesi bagian dari seri: hapus menawarkan "hanya sesi ini" atau "sesi ini dan berikutnya". */
  series?: { info: string; berikutnya: number; dilewati: number } | null;
}) {
  const { meta, items } = useLive();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeEdit = useCallback(() => setEdit(false), []);
  const doneEdit = useCallback((text: string) => {
    setEdit(false);
    setMessage({ ok: true, text });
  }, []);
  const closeRemove = useCallback(() => setRemove(false), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!canManage) return <p className="pr-hnote">Sesi ini milik pengajar lain. Anda hanya dapat melihatnya.</p>;

  const setStatus = (status: SessionStatus, confirmText?: string) => {
    setMenu(false);
    if (confirmText && !window.confirm(confirmText)) return;
    setMessage(null);
    pinSelection(meta.id);
    startTransition(async () => {
      const result = await run(ubahStatusSesi, { sesi_id: meta.id, status });
      setMessage({ ok: result.ok, text: result.message });
    });
  };

  const closeSession = () => {
    const waiting = items.filter((i) => i.status === "MENUNGGU").length;
    if (waiting) {
      setMessage({ ok: false, text: `Sahkan atau tolak ${waiting} pengajuan yang menunggu dulu, lalu tutup sesi.` });
      return;
    }
    const empty = items.filter((i) => i.status === "KOSONG").map((i) => i.nama);
    const list = empty.length > 8 ? `${empty.slice(0, 8).join(", ")}, dan ${empty.length - 8} lainnya` : empty.join(", ");
    setStatus("SELESAI", empty.length ? `Tutup sesi "${meta.nama}"?\n\n${empty.length} siswa belum tercatat akan dihitung alfa: ${list}.` : `Tutup sesi "${meta.nama}"? Semua siswa sudah tercatat.`);
  };

  const status = meta.status;
  const canEdit = Boolean(editFields) && (status === "AKAN_DATANG" || status === "AKTIF" || (status === "SELESAI" && isAdmin));
  const canCancel = status === "AKAN_DATANG" || status === "AKTIF" || (status === "SELESAI" && isAdmin);
  const menuItems = canEdit || canCancel || isAdmin;

  return (
    <>
      <div className="pr-hrow">
        {status === "AKTIF" && qrHref ? (
          <Link className="pr-hb" href={qrHref}>
            <PrIcon name="qr" />
            Tampilkan QR
          </Link>
        ) : null}
        {status === "AKTIF" ? (
          <button type="button" className="pr-hg" onClick={closeSession} disabled={pending}>
            <PrIcon name="lock" size="sm" />
            {pending ? "Memproses…" : "Tutup sesi"}
          </button>
        ) : null}
        {status === "AKAN_DATANG" && isToday ? (
          <button type="button" className="pr-hb" onClick={() => setStatus("AKTIF")} disabled={pending}>
            <PrIcon name="play" />
            {pending ? "Membuka…" : "Buka sesi"}
          </button>
        ) : null}
        {status === "SELESAI" && isToday ? (
          <button type="button" className="pr-hg" onClick={() => setStatus("AKTIF")} disabled={pending}>
            <PrIcon name="undo" size="sm" />
            {pending ? "Membuka…" : "Buka kembali"}
          </button>
        ) : null}
        {status === "DIBATALKAN" ? (
          isAdmin && meta.frozen ? (
            <button type="button" className="pr-hg" onClick={() => setStatus("SELESAI")} disabled={pending}>
              <PrIcon name="undo" size="sm" />
              Pulihkan sebagai selesai
            </button>
          ) : (
            <button type="button" className="pr-hg" onClick={() => setStatus("AKAN_DATANG")} disabled={pending}>
              <PrIcon name="undo" size="sm" />
              Jadwalkan ulang
            </button>
          )
        ) : null}
        <span className="pr-sp" />
        {rotateLabel ? <span className="pr-rot n pr-dk-only">{rotateLabel}</span> : null}
        {menuItems ? (
          <div className="pr-menu-wrap" ref={menuRef}>
            <button type="button" className="pr-hg pr-sq" aria-label="Lainnya" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <PrIcon name="dotsv" />
            </button>
            {menu ? (
              <div className="pr-menu" role="menu">
                {canEdit ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setEdit(true);
                    }}
                  >
                    <PrIcon name="edit" size="sm" />
                    Ubah detail
                  </button>
                ) : null}
                {canCancel ? (
                  <button type="button" role="menuitem" onClick={() => setStatus("DIBATALKAN", "Batalkan sesi ini? Sesi batal tidak dihitung dalam rekap; catatan kehadirannya tetap tersimpan.")}>
                    <PrIcon name="ban" size="sm" />
                    Batalkan sesi
                  </button>
                ) : null}
                {isAdmin && series ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="pr-danger"
                    onClick={() => {
                      setMenu(false);
                      setRemove(true);
                    }}
                  >
                    <PrIcon name="trash" size="sm" />
                    Hapus sesi…
                  </button>
                ) : isAdmin ? (
                  <ActionForm action={hapusSesi} operationId={deleteOperationId} confirm={`Hapus sesi "${meta.nama}"? Sesi dan catatan kehadirannya hilang dari aplikasi dan rekap.`} className="pr-menu-form">
                    <input type="hidden" name="sesi_id" value={meta.id} />
                    <input type="hidden" name="tanggal" value={meta.tanggal} />
                    <button type="submit" role="menuitem" className="pr-danger">
                      <PrIcon name="trash" size="sm" />
                      Hapus sesi
                    </button>
                  </ActionForm>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {message ? (
        <p className={`pr-hmsg${message.ok ? "" : " err"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      {canEdit ? (
        <Sheet open={edit} onClose={closeEdit} title="Ubah detail sesi" sub="Peserta dan tanggal sesi yang sudah dibuka tidak bisa diubah.">
          <SessionForm operationId={editOperationId} submitLabel="Simpan perubahan" onDone={doneEdit}>
            {editFields}
          </SessionForm>
        </Sheet>
      ) : null}
      {isAdmin && series ? (
        <Sheet open={remove} onClose={closeRemove} title="Hapus sesi" sub={`${meta.nama} · ${dayMonth(meta.tanggal)} · ${fmtTime(meta.jamMulai)} sampai ${fmtTime(meta.jamSelesai)}`}>
          <p className="pr-serinfo">
            <RepeatIc />
            <span>{series.info}</span>
          </p>
          <ActionForm action={hapusSesi} operationId={deleteOperationId} className="pr-acts">
            <input type="hidden" name="sesi_id" value={meta.id} />
            <input type="hidden" name="tanggal" value={meta.tanggal} />
            <button type="submit" name="lingkup" value="satu" className="pr-act">
              <span className="pr-ib">
                <PrIcon name="trash" size="sm" />
              </span>
              <span className="pr-main">
                <b>Hapus sesi ini saja</b>
                <span>mis. tanggal merah atau libur. Sesi lain di seri tetap ada.</span>
              </span>
            </button>
            <button type="submit" name="lingkup" value="seri" className="pr-act dg" disabled={series.berikutnya === 0}>
              <span className="pr-ib">
                <RepeatIc />
              </span>
              <span className="pr-main">
                <b>Sesi ini dan berikutnya di seri ini</b>
                <span className="n">
                  {series.berikutnya
                    ? `${series.berikutnya + 1} sesi dihapus. Sesi yang sudah berjalan atau sudah ada presensinya tetap tersimpan.`
                    : "Tidak ada sesi berikutnya yang belum berjalan."}
                </span>
              </span>
            </button>
          </ActionForm>
          <p className="pr-xs pr-muted">Sesi yang dihapus hilang dari jadwal dan rekap.</p>
        </Sheet>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Menunggu disahkan

const METHOD: Record<string, string> = { QR: "Pindai QR", MANDIRI: "Ajukan hadir", PENGAJAR: "Pengajar" };

export function PendingCard({ variant }: { variant: "phone" | "desk" }) {
  const { items, meta, busy, approve, reject } = useLive();
  const pending = items.filter((i) => i.status === "MENUNGGU").sort((a, b) => a.waktu.localeCompare(b.waktu));
  if (pending.length === 0 && (variant === "phone" || meta.status !== "AKTIF")) return null;
  const desk = variant === "desk";
  const all = pending.some((i) => busy[i.id]);
  return (
    <section className={`card pr-card pr-wait ${desk ? "pr-only-desk" : "pr-only-phone"}`} aria-label="Menunggu disahkan">
      <div className="pr-head">
        <h2>
          {desk ? "Menunggu" : "Menunggu disahkan"} <span className={`pr-pill ${pending.length ? "o" : "m"} n`}>{pending.length}</span>
        </h2>
        {pending.length && meta.canApprove ? (
          <button type="button" className={desk ? "pr-ok" : "pr-link"} onClick={() => void approve(null)} disabled={all}>
            {all ? "Menyimpan…" : "Sahkan semua"}
          </button>
        ) : null}
      </div>
      {pending.length === 0 ? <p className="pr-muted pr-xs">Belum ada pengajuan. Siswa yang memindai QR muncul di sini.</p> : null}
      <div className="pr-list">
        {pending.map((item) => (
          <div className="pr-item" key={item.id} aria-busy={busy[item.id] ? true : undefined}>
            <span className="pr-av">{initials(item.nama)}</span>
            <div className="pr-main">
              <b>{item.nama}</b>
              <span>
                {item.diajukan === "IZIN" || item.diajukan === "SAKIT" ? (
                  <>
                    <em className="pr-mini b">{item.diajukan === "IZIN" ? "Izin" : "Sakit"}</em> {item.catatan || fmtTime(item.waktu)}
                  </>
                ) : (
                  `${METHOD[item.metode] ?? "Ajukan hadir"} · ${fmtTime(item.waktu)}${item.terlambat ? " · telat" : ""}`
                )}
              </span>
            </div>
            {meta.canApprove ? (
              <>
                <button type="button" className="pr-no" aria-label={`Tolak pengajuan ${item.nama}`} title="Tolak" onClick={() => void reject(item.id)} disabled={Boolean(busy[item.id])}>
                  <PrIcon name="x" size="sm" />
                </button>
                <button type="button" className="pr-ok" aria-label={`Sahkan ${item.nama}`} onClick={() => void approve(item.id)} disabled={Boolean(busy[item.id])}>
                  <PrIcon name="ok" size="sm" />
                  <span className={desk ? "sr-only" : undefined}>Sahkan</span>
                </button>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Kartu siswa

type Filter = "semua" | "belum" | "tunggu" | "hadir" | "tidak";

function groupOf(item: RosterItem, ended: boolean): Exclude<Filter, "semua"> {
  if (item.status === "HADIR") return "hadir";
  if (item.status === "MENUNGGU") return "tunggu";
  if (item.status === "KOSONG" && !ended) return "belum";
  return "tidak";
}

const RANK: Record<Exclude<Filter, "semua">, number> = { belum: 0, tunggu: 1, tidak: 2, hadir: 3 };

export function RosterCard() {
  const { items, meta, busy, errors, notice, mark, approve, openDetail } = useLive();
  const ended = meta.status === "SELESAI";
  const [filter, setFilter] = useState<Filter>("semua");
  // Urutan dibekukan saat layar dibuka (belum di atas) agar kartu tidak melompat saat diketuk.
  const [order] = useState(() =>
    [...items].sort((a, b) => RANK[groupOf(a, ended)] - RANK[groupOf(b, ended)] || a.nama.localeCompare(b.nama, "id")).map((i) => i.id),
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  const sorted = [...order.filter((id) => byId.has(id)), ...items.map((i) => i.id).filter((id) => !order.includes(id))].map((id) => byId.get(id)!);
  const groups = { belum: 0, tunggu: 0, hadir: 0, tidak: 0 };
  for (const item of items) groups[groupOf(item, ended)] += 1;
  const options: { key: Filter; label: string; n: number }[] = [
    { key: "semua", label: "Semua", n: items.length },
    ...(ended ? [] : [{ key: "belum" as const, label: "Belum", n: groups.belum }]),
    ...(groups.tunggu ? [{ key: "tunggu" as const, label: "Menunggu", n: groups.tunggu }] : []),
    { key: "hadir", label: "Hadir", n: groups.hadir },
    ...(ended || groups.tidak ? [{ key: "tidak" as const, label: ended ? "Tidak hadir" : "Izin/alfa", n: groups.tidak }] : []),
  ];
  const active = options.some((o) => o.key === filter) ? filter : "semua";
  const cycleText = ended ? "Hadir → Izin → Sakit → Alfa" : "Belum → Hadir → Izin → Sakit → Alfa";
  const shown = sorted.filter((item) => active === "semua" || groupOf(item, ended) === active);

  const tap = (item: RosterItem) => {
    if (item.status === "MENUNGGU") {
      if (meta.canApprove) void approve(item.id);
      else openDetail(item.id);
      return;
    }
    void mark(item.id, nextMark(item.status, ended));
  };

  return (
    <section className="card pr-card pr-roster" aria-label="Daftar hadir">
      <div className="pr-head pr-head-wrap">
        <h2>Daftar hadir</h2>
        {items.length ? (
          <div className="pr-seg pr-fseg" role="group" aria-label="Saring siswa">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                className={o.key === "tunggu" || (o.key === "tidak" && !ended) ? "pr-dk-btn" : undefined}
                aria-pressed={active === o.key}
                onClick={() => setFilter(o.key)}
              >
                {o.label} <span className="n">{o.n}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {notice ? (
        <p className="pr-err" role="alert">
          {notice}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="pr-muted pr-xs">Belum ada peserta. Daftarkan siswa ke kelas ini dari halaman profil siswa.</p>
      ) : shown.length === 0 ? (
        <p className="pr-muted pr-xs">Tidak ada siswa di kelompok ini.</p>
      ) : (
        <div className="pr-grid">
          {shown.map((item) => (
            <StudentTile key={item.id} item={item} ended={ended} editable={meta.editable} busy={Boolean(busy[item.id])} error={errors[item.id]} onTap={tap} onHold={openDetail} />
          ))}
        </div>
      )}
      {meta.editable && items.length ? (
        <p className="pr-muted pr-xs">
          <span className="pr-touch">Ketuk: {cycleText}. Tahan kartu untuk jam masuk (terlambat) atau catatan.</span>
          <span className="pr-mouse">Klik kartu untuk ganti status ({cycleText}). Klik kanan untuk jam masuk (terlambat) atau catatan.</span>
        </p>
      ) : !meta.editable && items.length ? (
        <p className="pr-muted pr-xs">{meta.status === "DIBATALKAN" ? "Sesi dibatalkan. Catatan kehadiran tidak bisa diubah." : meta.status === "AKAN_DATANG" ? "Presensi bisa dicatat mulai hari sesi." : "Anda hanya dapat melihat daftar ini."}</p>
      ) : null}
    </section>
  );
}

function StudentTile({
  item,
  ended,
  editable,
  busy,
  error,
  onTap,
  onHold,
}: {
  item: RosterItem;
  ended: boolean;
  editable: boolean;
  busy: boolean;
  error?: string;
  onTap: (item: RosterItem) => void;
  onHold: (id: string) => void;
}) {
  const view = viewOf(item, ended);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const body = (
    <>
      <span className="pr-ava">
        {initials(item.nama)}
        {view.badge !== null ? <i aria-hidden="true">{view.badge}</i> : null}
      </span>
      <b>{shortName(item.nama)}</b>
      <small className="n">{error ? "Gagal, ulangi" : view.sub}</small>
    </>
  );
  const cls = `pr-t ${view.cls}${busy ? " is-busy" : ""}${error ? " is-err" : ""}`;
  if (!editable) {
    return (
      <div className={cls} title={item.catatan ? `${item.nama}: ${item.catatan}` : item.nama} role="img" aria-label={`${item.nama}: ${statusWord(item, ended)}`}>
        {body}
      </div>
    );
  }
  const next = item.status === "MENUNGGU" ? "sahkan" : `ubah ke ${LABEL[nextMark(item.status, ended)]}`;
  return (
    <button
      type="button"
      className={cls}
      title={item.catatan ? `${item.nama}: ${item.catatan}` : item.nama}
      aria-label={`${item.nama}: ${statusWord(item, ended)}. Ketuk untuk ${next}.`}
      aria-busy={busy || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        held.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = window.setTimeout(() => {
          held.current = true;
          navigator.vibrate?.(12);
          onHold(item.id);
        }, 480);
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        held.current = true;
        onHold(item.id);
      }}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onTap(item);
      }}
    >
      {body}
    </button>
  );
}

/** Lembar satu siswa: status, jam masuk (menentukan terlambat), dan keterangan. */
function StudentDetail({ item, onDone }: { item: RosterItem; onDone: () => void }) {
  const { meta, mark, approve, reject } = useLive();
  const ended = meta.status === "SELESAI";
  const [status, setStatus] = useState<Mark>(item.status === "MENUNGGU" ? item.diajukan || "HADIR" : item.status === "KOSONG" ? (ended ? "ALFA" : "HADIR") : (item.status as Mark));
  const [waktu, setWaktu] = useState(item.waktu || nowTime(meta.zona));
  const [catatan, setCatatan] = useState(item.catatan);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();
  const deadline = addMinutes(meta.jamMulai, meta.toleransi);
  const late = status === "HADIR" && /^\d{2}:\d{2}$/.test(waktu) && isLate(waktu, meta.jamMulai, meta.toleransi);
  const name = useId();

  const finish = (promise: Promise<ActionState>) =>
    startSaving(async () => {
      const result = await promise;
      if (result.ok) onDone();
      else setError(result.message);
    });

  return (
    <form
      className="stack pr-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        finish(mark(item.id, status, { waktu: status === "KOSONG" ? "" : waktu, catatan: catatan.trim() }));
      }}
    >
      {item.status === "MENUNGGU" ? (
        <div className="pr-warn o">
          <b>
            Mengajukan {item.diajukan === "IZIN" ? "izin" : item.diajukan === "SAKIT" ? "sakit" : "hadir"} · {fmtTime(item.waktu)}
          </b>
          <span>
            {METHOD[item.metode] ?? "Mandiri"}
            {item.catatan ? ` · “${item.catatan}”` : ""}
          </span>
          {meta.canApprove ? (
            <div className="row">
              <button type="button" className="pr-ok" onClick={() => finish(approve(item.id))} disabled={saving}>
                <PrIcon name="ok" size="sm" /> Sahkan
              </button>
              <button type="button" className="pr-no pr-no-text" onClick={() => finish(reject(item.id))} disabled={saving}>
                <PrIcon name="x" size="sm" /> Tolak
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <fieldset className="pr-chips" disabled={saving}>
        <legend className="field-label">Status</legend>
        {(["HADIR", "IZIN", "SAKIT", "ALFA", ...(ended ? [] : ["KOSONG"])] as Mark[]).map((m) => (
          <label key={m} className={`pr-chip c-${m.toLowerCase()}`}>
            <input type="radio" name={name} value={m} checked={status === m} onChange={() => setStatus(m)} />
            {m === "KOSONG" ? "Kosongkan" : LABEL[m]}
          </label>
        ))}
      </fieldset>
      {status !== "KOSONG" ? (
        <div className="field">
          <label htmlFor={`${name}-jam`}>Jam masuk</label>
          <input id={`${name}-jam`} type="time" value={waktu} onChange={(e) => setWaktu(e.target.value)} disabled={saving} />
          <span className="hint">{status === "HADIR" ? (late ? `Terlambat: lewat ${fmtTime(deadline)}.` : `Tepat waktu sampai ${fmtTime(deadline)}.`) : "Dipakai bila status diubah ke hadir."}</span>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor={`${name}-cat`}>Keterangan</label>
        <input id={`${name}-cat`} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. Acara keluarga" disabled={saving} />
      </div>
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Muat ulang berkala

/** Muat ulang data halaman berkala selama layar terlihat. */
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds]);
  return null;
}

// ---------------------------------------------------------------- Layar QR penuh

/** Hitung mundur sampai QR berganti; saat habis, layar dimuat ulang untuk QR baru. Layar dijaga tetap menyala. */
export function QrCountdown({ rotatesAt, serverNow, minutes }: { rotatesAt: number; serverNow: number; minutes: number }) {
  const router = useRouter();
  const [skew] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + skew), 1000);
    return () => window.clearInterval(id);
  }, [skew]);
  const left = Math.max(0, rotatesAt - now);
  useEffect(() => {
    if (left === 0 && refreshed.current !== rotatesAt) {
      refreshed.current = rotatesAt;
      router.refresh();
    }
  }, [left, rotatesAt, router]);
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l), () => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);
  const total = minutes * 60_000;
  const r = 12;
  const c = 2 * Math.PI * r;
  const sec = Math.ceil(left / 1000);
  return (
    <div className="pr-qtime" role="timer" aria-live="off">
      <svg className="pr-ring pr-qring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r={r} className="trk" strokeWidth="4" />
        <circle cx="15" cy="15" r={r} className="val" strokeWidth="4" strokeDasharray={`${(Math.min(left, total) / total) * c} ${c}`} transform="rotate(-90 15 15)" />
      </svg>
      <span>
        QR baru dalam{" "}
        <b className="n">
          {String(Math.floor(sec / 60)).padStart(2, "0")}.{String(sec % 60).padStart(2, "0")}
        </b>
      </span>
    </div>
  );
}

export function RefreshButton({ className = "pr-qbtn", label = "Muat ulang QR dan angka" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={`${className}${pending ? " is-busy" : ""}`} aria-label={label} title={label} onClick={() => start(() => router.refresh())}>
      <PrIcon name="refresh" />
    </button>
  );
}

/** Pengajuan terbaru di layar QR, bisa langsung disahkan. */
export function QrToast({ sesiId, id, nama, sub }: { sesiId: string; id: string; nama: string; sub: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  const [, start] = useTransition();
  return (
    <div className="pr-toast" role="status">
      <span className="pr-av">{initials(nama)}</span>
      <div className="pr-main">
        <b>{nama}</b>
        <span>{state.error || sub}</span>
      </div>
      <button
        type="button"
        className="pr-ok"
        disabled={state.busy}
        onClick={() => {
          setState({ busy: true, error: "" });
          start(async () => {
            const result = await run(sahkanPresensi, { sesi_id: sesiId, siswa_id: id });
            setState({ busy: false, error: result.ok ? "" : result.message });
          });
        }}
      >
        <PrIcon name="ok" size="sm" />
        {state.busy ? "Menyimpan…" : "Sahkan"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Siswa

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Tombol presensi siswa untuk sesi yang sedang dibuka. */
export function StudentActions({ sesiId }: { sesiId: string }) {
  const router = useRouter();
  const testId = useUjiSiswaId();
  const [sheet, setSheet] = useState<"scan" | "izin" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const close = useCallback(() => setSheet(null), []);

  const submit = (status: "HADIR" | "IZIN" | "SAKIT", catatan = "") =>
    new Promise<ActionState>((resolve) =>
      start(async () => {
        const result = await run(ajukanPresensi, { sesi_id: sesiId, status_diajukan: status, catatan, [UJI_SISWA_FIELD]: testId ?? "" });
        setMessage({ ok: result.ok, text: result.message });
        resolve(result);
      }),
    );

  return (
    <>
      <button type="button" className="pr-hb pr-block pr-lg" onClick={() => setSheet("scan")}>
        <PrIcon name="scan" />
        Pindai QR
      </button>
      <div className="pr-grid2">
        <button type="button" className="pr-hg" onClick={() => void submit("HADIR")} disabled={pending}>
          <PrIcon name="okc" size="sm" />
          {pending ? "Mengirim…" : "Ajukan hadir"}
        </button>
        <button type="button" className="pr-hg" onClick={() => setSheet("izin")} disabled={pending}>
          <PrIcon name="note" size="sm" />
          Izin / sakit
        </button>
      </div>
      {message ? (
        <p className={`pr-hmsg${message.ok ? "" : " err"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      <Sheet open={sheet === "scan"} onClose={close} title="Pindai QR" sub="QR ada di layar pelatih dan berganti tiap 10 menit.">
        <ScanQr onToken={(path) => router.push(path)} />
      </Sheet>
      <Sheet open={sheet === "izin"} onClose={close} title="Izin atau sakit" sub="Pelatih akan mengesahkan pengajuan Anda.">
        <LeaveForm
          onSubmit={async (status, catatan) => {
            const result = await submit(status, catatan);
            if (result.ok) close();
            return result;
          }}
        />
      </Sheet>
    </>
  );
}

function ScanQr({ onToken }: { onToken: (path: string) => void }) {
  const [detector, setDetector] = useState<BarcodeDetectorCtor | null>(null);
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: "" });
  useEffect(() => {
    const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (ctor) setDetector(() => ctor);
  }, []);
  return (
    <div className="stack pr-form">
      {detector ? (
        <label className={`pr-hb pr-block pr-lg pr-file${state.busy ? " is-busy" : ""}`}>
          <PrIcon name="scan" />
          {state.busy ? "Membaca QR…" : "Buka kamera"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setState({ busy: true, error: "" });
              try {
                const codes = await new detector({ formats: ["qr_code"] }).detect(await createImageBitmap(file));
                const url = new URL(codes[0]?.rawValue ?? "", window.location.href);
                const token = url.searchParams.get("t");
                if (url.pathname !== "/qr-presensi" || !token) throw new Error("bukan QR presensi");
                onToken(`/qr-presensi?t=${encodeURIComponent(token)}`);
              } catch {
                setState({ busy: false, error: "QR tidak terbaca. Foto lebih dekat dan pastikan seluruh QR masuk." });
              }
            }}
          />
        </label>
      ) : null}
      {state.error ? (
        <p className="notice notice-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <ol className="pr-steps-list">
        <li>Buka aplikasi kamera HP{detector ? " (atau tombol di atas)" : ""}.</li>
        <li>Arahkan ke QR di layar pelatih, lalu ketuk tautan yang muncul.</li>
        <li>Ketuk Ajukan hadir. Pelatih tinggal mengesahkan.</li>
      </ol>
      <p className="pr-muted pr-xs">Kamera tidak bisa dipakai? Tutup lembar ini lalu ketuk Ajukan hadir.</p>
    </div>
  );
}

function LeaveForm({ onSubmit }: { onSubmit: (status: "IZIN" | "SAKIT", catatan: string) => Promise<ActionState> }) {
  const [status, setStatus] = useState<"IZIN" | "SAKIT">("IZIN");
  const [catatan, setCatatan] = useState("");
  const [error, setError] = useState("");
  const [saving, start] = useTransition();
  const id = useId();
  return (
    <form
      className="stack pr-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!catatan.trim()) {
          setError("Tuliskan keterangan izin atau sakit.");
          return;
        }
        setError("");
        start(async () => {
          const result = await onSubmit(status, catatan.trim());
          if (!result.ok) setError(result.message);
        });
      }}
    >
      <fieldset className="pr-chips" disabled={saving}>
        <legend className="field-label">Jenis</legend>
        {(["IZIN", "SAKIT"] as const).map((s) => (
          <label key={s} className={`pr-chip c-${s.toLowerCase()}`}>
            <input type="radio" name={id} value={s} checked={status === s} onChange={() => setStatus(s)} />
            {s === "IZIN" ? "Izin" : "Sakit"}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-cat`}>
          Keterangan <span className="muted">*</span>
        </label>
        <textarea id={`${id}-cat`} value={catatan} maxLength={500} onChange={(e) => setCatatan(e.target.value)} placeholder={status === "SAKIT" ? "mis. Demam sejak pagi" : "mis. Acara keluarga"} aria-invalid={error ? true : undefined} disabled={saving} />
      </div>
      {error ? (
        <p className="notice notice-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? "Mengirim…" : "Kirim pengajuan"}
        </button>
      </div>
    </form>
  );
}

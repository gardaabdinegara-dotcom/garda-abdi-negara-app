"use client";

// Dompet Keuangan (opsi A "Dompet sederhana"): tombol Uang masuk / Uang keluar / Pindah, riwayat per tanggal,
// dan lembar isian. Di HP lembar muncul dari bawah dengan papan angka; di laptop menjadi panel di kanan.
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { jalankanKeuangan } from "@/app/actions/keuangan";
import { initialActionState } from "@/lib/action-state";
import type { BarisDompet, HariDompet } from "@/lib/keuangan/dompet";
import { Icon } from "./icon";
import { accountIcon, KgIcon } from "./keuangan-ikon";

type Kind = "in" | "out" | "move";
type Panel = { view: "catat"; kind: Kind } | { view: "ubah"; row: BarisDompet } | { view: "hapus"; row: BarisDompet; back: boolean };

export interface DompetAkun {
  id: string;
  name: string;
  short: string;
  jenis: string;
}
export interface DompetKategori {
  id: string;
  name: string;
  kinds: string[];
}
type Option = { value: string; label: string };

/** Siswa aktif untuk pilihan "Dari siswa" (uang masuk yang ditautkan ke satu siswa). */
export interface DompetSiswa {
  id: string;
  kode: string;
  nama: string;
  /** Kelas atau jalur, mis. "TNI A". */
  info: string;
  /** Tanggal uang masuk terakhir dari siswa ini (YYYY-MM-DD), kosong bila belum ada. */
  terakhir: string;
}

export interface DompetProps {
  hero: React.ReactNode;
  side: React.ReactNode;
  filters?: React.ReactNode;
  days: HariDompet[];
  emptyTitle: string;
  emptyText: string;
  accounts: DompetAkun[];
  categories: DompetKategori[];
  students: DompetSiswa[];
  programs: Option[];
  kinds: { in: Option[]; out: Option[] };
  today: string;
  owner: boolean;
  recorder: boolean;
}

const rp = (n: number) => `Rp${Math.abs(n).toLocaleString("id-ID")}`;

/** ID operasi (UUID v4). crypto.randomUUID hanya ada di konteks aman, jadi ada cadangan getRandomValues. */
function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Terbilang rupiah (salinan klien dari ringkasan.ts). */
export function terbilang(value: number): string {
  const words = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const say = (n: number): string => {
    if (n < 12) return words[n]!;
    if (n < 20) return `${say(n - 10)} belas`;
    if (n < 100) return `${say(Math.floor(n / 10))} puluh ${say(n % 10)}`.trim();
    if (n < 200) return `seratus ${say(n - 100)}`.trim();
    if (n < 1000) return `${say(Math.floor(n / 100))} ratus ${say(n % 100)}`.trim();
    if (n < 2000) return `seribu ${say(n - 1000)}`.trim();
    if (n < 1_000_000) return `${say(Math.floor(n / 1000))} ribu ${say(n % 1000)}`.trim();
    if (n < 1_000_000_000) return `${say(Math.floor(n / 1_000_000))} juta ${say(n % 1_000_000)}`.trim();
    if (n < 1_000_000_000_000) return `${say(Math.floor(n / 1_000_000_000))} miliar ${say(n % 1_000_000_000)}`.trim();
    return `${say(Math.floor(n / 1_000_000_000_000))} triliun ${say(n % 1_000_000_000_000)}`.trim();
  };
  const n = Math.round(Math.abs(value));
  return `${n === 0 ? "nol" : say(n).replace(/\s+/g, " ")} rupiah`;
}

function shiftDate(date: string, delta: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const SHORT_DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
function dateChip(date: string, today: string) {
  if (date === today) return "Hari ini";
  if (date === shiftDate(today, -1)) return "Kemarin";
  return SHORT_DATE.format(new Date(`${date}T00:00:00Z`));
}

const subOf = (row: BarisDompet, short = false) => [...row.meta, short ? row.accountShort : row.account].filter(Boolean).join(" · ");
const amountOf = (row: BarisDompet) => `${row.sign}${rp(row.amount)}`;
const ICON = { in: "in", out: "out", tr: "swap", fix: "fix" } as const;

function RowFace({ row }: { row: BarisDompet }) {
  return (
    <>
      <span className={`kg-ic ${row.arah}`}>
        <KgIcon name={ICON[row.arah]} size="s" />
      </span>
      <span className="kg-tx-main">
        <b>{row.title}</b>
        <span className="kg-sub-full">{subOf(row)}</span>
        <span className="kg-sub-short">{subOf(row, true)}</span>
      </span>
      {row.status === "dikoreksi" ? <span className="badge">Dihapus</span> : row.status === "koreksi" ? <span className="badge">Koreksi</span> : null}
      <span className={`kg-amt-${row.arah}${row.status === "dikoreksi" ? " kg-struck" : ""}`}>{amountOf(row)}</span>
    </>
  );
}

export function Dompet(props: DompetProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Di HP lembar menutupi layar: halaman di belakangnya dikunci agar tidak ikut tergulir.
  useEffect(() => {
    if (!panel || !window.matchMedia("(max-width: 900px)").matches) return;
    const root = document.documentElement;
    root.classList.add("kg-lock");
    return () => root.classList.remove("kg-lock");
  }, [panel]);

  const canWrite = props.recorder && props.accounts.length > 0;
  const activeKind = panel?.view === "catat" ? panel.kind : null;
  const openRow = (row: BarisDompet) => {
    if (row.edit) setPanel({ view: "ubah", row });
    else if (row.hapus) setPanel({ view: "hapus", row, back: false });
  };
  const done = (text: string) => {
    setPanel(null);
    setToast({ id: Date.now(), text });
  };

  return (
    <>
      <div className={`kg-grid${panel ? " has-panel" : ""}`}>
        <div className="kg-col">
          {props.hero}
          {canWrite ? (
            <div className={`kg-acts${props.accounts.length > 1 ? "" : " two"}`}>
              <button type="button" className="btn kg-btn-in" aria-pressed={activeKind === "in"} onClick={() => setPanel({ view: "catat", kind: "in" })}>
                <KgIcon name="in" />
                Uang masuk
              </button>
              <button type="button" className="btn kg-btn-out" aria-pressed={activeKind === "out"} onClick={() => setPanel({ view: "catat", kind: "out" })}>
                <KgIcon name="out" />
                Uang keluar
              </button>
              {props.accounts.length > 1 ? (
                <button type="button" className="btn kg-btn-mv" aria-pressed={activeKind === "move"} title="Pindah saldo antar akun" onClick={() => setPanel({ view: "catat", kind: "move" })}>
                  <KgIcon name="swap" />
                  Pindah
                </button>
              ) : null}
            </div>
          ) : null}
          <section className="card kg-list" aria-labelledby={listId}>
            <div className="kg-list-head">
              <h2 id={listId}>Riwayat</h2>
              {props.owner && props.days.length ? (
                <span className="kg-hint">
                  <span className="kg-sub-full">Arahkan kursor ke baris untuk ubah atau hapus</span>
                  <span className="kg-sub-short">Ketuk baris untuk ubah atau hapus</span>
                </span>
              ) : null}
            </div>
            {props.filters}
            {props.days.length === 0 ? (
              <div className="kg-empty">
                <b>{props.emptyTitle}</b>
                <span>{props.emptyText}</span>
              </div>
            ) : (
              props.days.map((day) => (
                <div className="kg-dayblock" key={day.date}>
                  <h3 className="kg-day">{day.label}</h3>
                  <ul className="kg-rows">
                    {day.rows.map((row) => {
                      const action = row.edit || row.hapus;
                      const selected = panel && panel.view !== "catat" && panel.row.id === row.id;
                      return (
                        <li key={row.id} className={`kg-tx${selected ? " on" : ""}${row.status ? " muted-row" : ""}`}>
                          {action ? (
                            <button type="button" className="kg-hit" aria-haspopup="dialog" onClick={() => openRow(row)}>
                              <RowFace row={row} />
                            </button>
                          ) : (
                            <div className="kg-hit static">
                              <RowFace row={row} />
                            </div>
                          )}
                          {action ? (
                            <span className="kg-ia">
                              {row.edit ? (
                                <button type="button" aria-label={`Ubah ${row.title}`} title="Ubah" onClick={() => setPanel({ view: "ubah", row })}>
                                  <KgIcon name="edit" size="s" />
                                </button>
                              ) : null}
                              {row.hapus ? (
                                <button type="button" className="d" aria-label={`Hapus ${row.title}`} title="Hapus" onClick={() => setPanel({ view: "hapus", row, back: false })}>
                                  <KgIcon name="trash" size="s" />
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
        <div className="kg-col kg-side">
          {panel && canWrite ? (
            <Lembar
              key={panel.view === "catat" ? "catat" : `${panel.view}-${panel.row.id}`}
              panel={panel}
              ctx={props}
              onPanel={setPanel}
              onClose={() => setPanel(null)}
              onDone={done}
            />
          ) : null}
          {props.side}
        </div>
      </div>
      <div className="kg-toast-wrap" aria-live="polite">
        {toast ? (
          <div className="kg-toast" key={toast.id} role="status">
            <KgIcon name="ok" size="s" />
            {toast.text}
          </div>
        ) : null}
      </div>
    </>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0", "del"];

function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div className="kg-keys" role="group" aria-label="Papan angka">
      {KEYS.map((key) => (
        <button key={key} type="button" onClick={() => onKey(key)} aria-label={key === "del" ? "Hapus satu angka" : undefined}>
          {key === "del" ? <KgIcon name="back" size="l" /> : key}
        </button>
      ))}
    </div>
  );
}

function Seg<T extends string>({ name, value, options, onChange, label }: { name?: string; value: T; options: { value: T; label: string; icon?: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  const group = useId();
  return (
    <div className="kg-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className={o.value === value ? "on" : undefined}>
          <input type="radio" name={name ?? group} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.icon}
          {o.label}
        </label>
      ))}
    </div>
  );
}

const TITLE: Record<Kind, string> = { in: "Catat uang masuk", out: "Catat uang keluar", move: "Pindah saldo" };
const SAVE: Record<Kind, string> = { in: "Simpan uang masuk", out: "Simpan uang keluar", move: "Simpan pindah saldo" };
const PLACEHOLDER: Record<Kind, string> = { in: "mis. Cicilan 2 bimbel", out: "mis. Sewa lapangan latihan", move: "Setor tunai ke bank" };
/** Keterangan otomatis saat memilih siswa (bila keterangan masih kosong). */
const ketOtomatis = (nama: string) => `Pembayaran bimbel · ${nama}`;
const TGL_SINGKAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const singkatTanggal = (d: string) => (d ? TGL_SINGKAT.format(new Date(`${d}T00:00:00Z`)).replace(".", "") : "");
const inisial = (nama: string) =>
  nama
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";
const subSiswa = (s: DompetSiswa, terakhir = false) => [s.kode, s.info, terakhir && s.terakhir ? `terakhir bayar ${singkatTanggal(s.terakhir)}` : ""].filter(Boolean).join(" · ");
const normal = (v: string) => v.toLowerCase().replace(/[\s-]+/g, "");

/** Nama dengan bagian yang cocok dengan kata kunci ditandai. */
function Sorot({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** Lembar kecil "Dari siswa": cari nama atau kode, pilih satu siswa, atau Tanpa siswa. */
function PilihSiswa({ students, current, onPick, onClose }: { students: DompetSiswa[]; current: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [pilih, setPilih] = useState(current);
  const titleId = useId();
  const kunci = q.trim();
  const cocok = kunci ? students.filter((s) => s.nama.toLowerCase().includes(kunci.toLowerCase()) || normal(s.kode).includes(normal(kunci))) : students;
  const terpilih = students.find((s) => s.id === pilih);
  return (
    <div
      className="kg-pick-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="kg-shtop">
        <h3 id={titleId} className="kg-ptitle show">
          Dari siswa
        </h3>
        <button type="button" className="kg-x" onClick={onClose} aria-label="Tutup pilihan siswa">
          <KgIcon name="x" />
        </button>
      </div>
      <label className="kg-pick-search">
        <span className="sr-only">Cari nama atau kode siswa</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau kode GAN" autoComplete="off" autoFocus />
      </label>
      <p className="kg-pick-hint" aria-live="polite">
        {kunci ? `${cocok.length} siswa cocok.` : `${students.length} siswa aktif.`}
      </p>
      <ul className="kg-pick-list">
        {cocok.map((s) => (
          <li key={s.id}>
            <button type="button" className={pilih === s.id ? "on" : undefined} aria-pressed={pilih === s.id} onClick={() => setPilih(s.id)} onDoubleClick={() => onPick(s.id)}>
              <span className="kg-av">{inisial(s.nama)}</span>
              <span className="kg-pick-main">
                <b>
                  <Sorot text={s.nama} q={kunci} />
                </b>
                <span>{subSiswa(s, true)}</span>
              </span>
              {pilih === s.id ? <KgIcon name="ok" size="s" /> : null}
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={pilih === "" ? "on" : undefined} aria-pressed={pilih === ""} onClick={() => setPilih("")}>
            <span className="kg-av is-none">-</span>
            <span className="kg-pick-main">
              <b>Tanpa siswa</b>
              <span>Pemasukan umum, tidak ditautkan</span>
            </span>
            {pilih === "" ? <KgIcon name="ok" size="s" /> : null}
          </button>
        </li>
      </ul>
      <button type="button" className="btn btn-block kg-pick-ok" onClick={() => onPick(pilih)}>
        {terpilih ? `Pilih ${terpilih.nama}` : "Tanpa siswa"}
      </button>
    </div>
  );
}

function Lembar({
  panel,
  ctx,
  onPanel,
  onClose,
  onDone,
}: {
  panel: Panel;
  ctx: DompetProps;
  onPanel: (p: Panel | null) => void;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { accounts, categories, today, owner } = ctx;
  const [state, dispatch, pending] = useActionState(jalankanKeuangan, initialActionState);
  const [opId, setOpId] = useState(newId);
  const handled = useRef<number | undefined>(undefined);
  const successText = useRef("");
  const sheetRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const uid = useId();

  const row = panel.view === "catat" ? null : panel.row;
  const kind: Kind = panel.view === "catat" ? panel.kind : row!.arah === "in" ? "in" : row!.arah === "tr" ? "move" : "out";
  const edit = row?.edit ?? null;
  const defaultJenis = (k: Kind) => (k === "out" ? ctx.kinds.out[0]?.value : ctx.kinds.in[0]?.value) ?? "";
  const firstCategory = (jenis: string) => categories.find((c) => c.kinds.includes(jenis))?.id ?? "";

  const [digits, setDigits] = useState(edit ? String(edit.nominal) : "");
  const [jenis, setJenis] = useState(edit?.jenis ?? defaultJenis(kind));
  const [kategori, setKategori] = useState(edit ? edit.kategori_id : firstCategory(defaultJenis(kind)));
  const [akun, setAkun] = useState(edit?.akun_id ?? accounts[0]?.id ?? "");
  const [dari, setDari] = useState(accounts[0]?.id ?? "");
  const [ke, setKe] = useState(accounts[1]?.id ?? "");
  const [tanggal, setTanggal] = useState(edit?.tanggal ?? today);
  const [ket, setKet] = useState(edit?.deskripsi ?? "");
  const [siswa, setSiswa] = useState(edit?.siswa_id ?? "");
  const [cariSiswa, setCariSiswa] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [detail, setDetail] = useState(false);
  const [localError, setLocalError] = useState("");
  const [forKind, setForKind] = useState(kind);
  const [askReason, setAskReason] = useState(0);

  // Pindah jenis lewat tombol di kiri atau tab di lembar: kategori ikut menyesuaikan, nominal tetap.
  if (panel.view === "catat" && forKind !== kind) {
    setForKind(kind);
    const nextJenis = defaultJenis(kind);
    setJenis(nextJenis);
    setKategori(firstCategory(nextJenis));
    setLocalError("");
  }

  useEffect(() => {
    if (!state.at || state.at === handled.current) return;
    handled.current = state.at;
    if (state.ok) {
      onDone(successText.current || state.message);
      return;
    }
    if (owner && /saldo akun tidak cukup/i.test(state.message)) {
      setDetail(true);
      setAskReason((n) => n + 1);
    }
  }, [state, onDone, owner]);

  // Setelah kotak detail tampil, arahkan ke isian alasan.
  useEffect(() => {
    if (askReason) reasonRef.current?.focus();
  }, [askReason]);

  useEffect(() => {
    const target = window.matchMedia("(min-width: 901px)").matches ? sheetRef.current?.querySelector<HTMLElement>("[data-autofocus]") : null;
    (target ?? sheetRef.current)?.focus({ preventScroll: true });
  }, [panel.view]);

  const view = panel.view;
  const value = Number(digits || 0);
  const formatted = digits ? value.toLocaleString("id-ID") : "";
  const kindCategories = categories.filter((c) => c.kinds.includes(jenis));
  const categoryName = categories.find((c) => c.id === kategori)?.name ?? "";
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "";
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name.replace(/^rekening\s+/i, ""), icon: <KgIcon name={accountIcon(a.jenis)} size="s" /> }));
  const error = localError || (!state.ok && state.message ? state.message : "");
  const bisaSiswa = kind === "in" && jenis === "PENERIMAAN_LAIN" && view !== "hapus" && (ctx.students.length > 0 || Boolean(siswa));
  const siswaTerpilih = ctx.students.find((s) => s.id === siswa) ?? null;

  function press(key: string) {
    setLocalError("");
    if (key === "del") return setDigits((d) => d.slice(0, -1));
    setDigits((d) => {
      if (!d && (key === "0" || key === "000")) return d;
      const next = d + key;
      return next.length > 12 ? d : next;
    });
  }

  function typed(raw: string) {
    setLocalError("");
    setDigits(raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12));
  }

  // "Dari siswa": keterangan diisi otomatis bila masih kosong (atau masih isian otomatis siswa sebelumnya).
  function pickStudent(id: string) {
    const before = ctx.students.find((s) => s.id === siswa);
    const next = ctx.students.find((s) => s.id === id);
    const masihOtomatis = !ket.trim() || (before && ket === ketOtomatis(before.nama));
    setSiswa(next ? next.id : "");
    if (masihOtomatis) setKet(next ? ketOtomatis(next.nama) : "");
    setCariSiswa(false);
  }

  function onDari(id: string) {
    setDari(id);
    if (ke === id) setKe(accounts.find((a) => a.id !== id)?.id ?? "");
  }
  function onKe(id: string) {
    setKe(id);
    if (dari === id) setDari(accounts.find((a) => a.id !== id)?.id ?? "");
  }

  function switchView(next: Panel) {
    setOpId(newId());
    setLocalError("");
    onPanel(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    if (view === "hapus") {
      if (!alasan.trim()) return setLocalError("Tulis alasan hapus dulu.");
      successText.current = "Catatan dihapus. Saldo dan laporan sudah disesuaikan.";
    } else {
      if (!value) return setLocalError("Isi nominal dulu.");
      if (kind === "move") {
        if (!dari || !ke || dari === ke) return setLocalError("Pilih akun asal dan tujuan yang berbeda.");
        successText.current = `Pindah ${rp(value)} dari ${accountName(dari)} ke ${accountName(ke)} disimpan.`;
      } else {
        if (!ket.trim()) {
          if (!categoryName) return setLocalError("Tulis keterangan atau pilih kategori.");
          form.set("deskripsi", categoryName);
        }
        successText.current = view === "ubah" ? "Perubahan disimpan." : `${kind === "in" ? "Uang masuk" : "Uang keluar"} ${rp(value)} disimpan.`;
      }
    }
    setLocalError("");
    startTransition(() => dispatch(form));
  }

  const aksi = view === "hapus" ? "transaction.reverse" : view === "ubah" ? "transaction.edit" : kind === "move" ? "transfer.create" : "transaction.create";
  const heading = view === "hapus" ? "Hapus catatan?" : view === "ubah" ? (kind === "in" ? "Ubah uang masuk" : "Ubah uang keluar") : TITLE[kind];
  const saveLabel = view === "ubah" ? "Simpan perubahan" : SAVE[kind];

  return (
    <>
      <div className="kg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`kg-sheet${view === "hapus" ? " is-del" : ""}`}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <form className="kg-form" onSubmit={submit} noValidate>
          <input type="hidden" name="operation_id" value={opId} />
          <input type="hidden" name="aksi" value={aksi} />
          <div className="kg-sheet-body">
            {view === "catat" ? (
              <div className="kg-shtop">
                <h2 id={titleId} className="kg-ptitle">
                  {heading}
                </h2>
                <Seg
                  label="Jenis catatan"
                  value={kind}
                  onChange={(k) => onPanel({ view: "catat", kind: k })}
                  options={[
                    { value: "in", label: "Uang masuk" },
                    { value: "out", label: "Uang keluar" },
                    ...(accounts.length > 1 ? [{ value: "move" as const, label: "Pindah" }] : []),
                  ]}
                />
                <button type="button" className="kg-x" onClick={onClose} aria-label="Tutup">
                  <KgIcon name="x" />
                </button>
              </div>
            ) : (
              <div className="kg-shtop">
                <h2 id={titleId} className="kg-ptitle show">
                  {heading}
                </h2>
                {view === "ubah" && row?.hapus ? (
                  <button type="button" className="btn btn-sm kg-btn-danger" onClick={() => switchView({ view: "hapus", row: row!, back: true })}>
                    <KgIcon name="trash" size="s" />
                    Hapus
                  </button>
                ) : null}
                <button type="button" className="kg-x" onClick={onClose} aria-label="Tutup">
                  <KgIcon name="x" />
                </button>
              </div>
            )}

            {view === "hapus" && row ? (
              <>
                <input type="hidden" name="transaksi_id" value={row.hapus?.transaksi_id ?? row.id} />
                <input type="hidden" name="tanggal_transaksi" value={row.hapus?.tanggal ?? row.date} />
                <div className="kg-del-sum">
                  <RowFace row={row} />
                </div>
                <p className="kg-note">
                  {row.arah === "tr" ? "Kedua sisi pindah saldo ikut dihapus. " : ""}
                  Saldo dan laporan kembali seperti sebelum dicatat. Jejaknya tetap tersimpan sebagai koreksi.
                </p>
                <div className="field">
                  <label htmlFor={`${uid}-alasan`}>Alasan hapus</label>
                  <input id={`${uid}-alasan`} data-autofocus name="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. tercatat dua kali" autoComplete="off" required />
                </div>
              </>
            ) : (
              <>
                {view === "ubah" && row ? <input type="hidden" name="transaksi_id" value={row.id} /> : null}
                <input type="hidden" name="nominal" value={digits} />
                <div className="kg-amt">
                  <span className="sr-only">Nominal</span>
                  <span aria-hidden="true">Rp</span>
                  <b className={digits ? undefined : "zero"}>{formatted || "0"}</b>
                  <i aria-hidden="true" />
                </div>
                <label className="kg-damt">
                  <span>Rp</span>
                  <input data-autofocus inputMode="numeric" autoComplete="off" aria-label="Nominal" placeholder="0" value={formatted} onChange={(e) => typed(e.target.value)} />
                </label>
                <div className="kg-terb">{digits ? terbilang(value) : "Ketik nominal"}</div>

                {kind === "move" ? (
                  <>
                    <div className="kg-lbl">Dari</div>
                    <Seg label="Dari akun" name="dari_akun_id" value={dari} onChange={onDari} options={accountOptions} />
                    <div className="kg-lbl">Ke</div>
                    <Seg label="Ke akun" name="ke_akun_id" value={ke} onChange={onKe} options={accountOptions} />
                  </>
                ) : (
                  <>
                    <input type="hidden" name="jenis" value={jenis} />
                    <div className="kg-lbl" id={`${uid}-untuk`}>
                      Untuk apa?
                    </div>
                    {kindCategories.length ? (
                      <div className="kg-chips" role="radiogroup" aria-labelledby={`${uid}-untuk`}>
                        {kindCategories.map((c) => (
                          <label key={c.id} className={`kg-chip${kategori === c.id ? " on" : ""}`}>
                            <input type="radio" name="kategori_id" value={c.id} checked={kategori === c.id} onChange={() => setKategori(c.id)} />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="kg-note">Belum ada kategori untuk jenis ini. Tambahkan di Lainnya, Kategori.</p>
                    )}
                  </>
                )}

                {bisaSiswa ? (
                  <>
                    <input type="hidden" name="siswa_id" value={siswa} />
                    <div className="kg-lbl">
                      Dari siswa <em>opsional</em>
                    </div>
                    {siswa ? (
                      <div className="kg-pick">
                        <span className="kg-av">{inisial(siswaTerpilih?.nama ?? "?")}</span>
                        <span className="kg-pick-main">
                          <b>{siswaTerpilih?.nama ?? "Siswa tertaut"}</b>
                          <span>{siswaTerpilih ? subSiswa(siswaTerpilih) : "Tidak ada di daftar siswa aktif"}</span>
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCariSiswa(true)} aria-haspopup="dialog">
                          Ganti
                        </button>
                        <button type="button" className="kg-pick-x" onClick={() => pickStudent("")} aria-label="Lepas siswa">
                          <KgIcon name="x" size="s" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="kg-pick-btn" onClick={() => setCariSiswa(true)} aria-haspopup="dialog">
                        <Icon name="user" />
                        Pilih siswa
                        <span>agar masuk riwayat bayar siswa</span>
                      </button>
                    )}
                  </>
                ) : null}
                <div className="kg-ket">
                  <label htmlFor={`${uid}-ket`} className="sr-only">
                    Keterangan
                  </label>
                  <input id={`${uid}-ket`} name="deskripsi" value={ket} onChange={(e) => setKet(e.target.value)} placeholder={PLACEHOLDER[kind]} autoComplete="off" maxLength={500} />
                  {bisaSiswa && siswaTerpilih && ket === ketOtomatis(siswaTerpilih.nama) ? <span className="kg-auto">otomatis</span> : null}
                </div>

                <div className="kg-row2">
                  {kind !== "move" ? <Seg label={kind === "in" ? "Masuk ke" : "Keluar dari"} name="akun_id" value={akun} onChange={setAkun} options={accountOptions} /> : null}
                  <label className="kg-date">
                    <KgIcon name="cal" size="s" />
                    <span>{dateChip(tanggal, today)}</span>
                    <input
                      type="date"
                      name="tanggal_transaksi"
                      value={tanggal}
                      aria-label="Tanggal"
                      onChange={(e) => setTanggal(e.target.value || today)}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker?.();
                        } catch {
                          /* Peramban lama: kolom tanggal tetap bisa diketik. */
                        }
                      }}
                    />
                  </label>
                </div>

                {view === "ubah" ? (
                  <>
                    <div className="field">
                      <label htmlFor={`${uid}-alasan`}>Alasan perubahan (opsional)</label>
                      <input id={`${uid}-alasan`} name="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. salah nominal" autoComplete="off" />
                    </div>
                    {row?.bukti ? (
                      <a className="kg-more-btn" href={row.bukti} target="_blank" rel="noopener noreferrer nofollow">
                        <KgIcon name="clip" size="s" />
                        Lihat bukti
                      </a>
                    ) : null}
                  </>
                ) : kind === "move" && !owner ? null : (
                  <>
                    <button type="button" className="kg-more-btn" aria-expanded={detail} aria-controls={`${uid}-detail`} onClick={() => setDetail((d) => !d)}>
                      <KgIcon name="clip" size="s" />
                      {kind === "move" ? "Tambah detail (opsional)" : "Tambah bukti atau detail (opsional)"}
                    </button>
                    <div className="kg-detail" id={`${uid}-detail`} hidden={!detail}>
                      {kind !== "move" ? (
                        <>
                          <div className="field">
                            <label htmlFor={`${uid}-bukti`}>Tautan bukti</label>
                            <input id={`${uid}-bukti`} name="bukti_url" type="url" inputMode="url" placeholder="https://drive.google.com/..." autoComplete="off" />
                          </div>
                          <div className="field">
                            <label htmlFor={`${uid}-jenis`}>Jenis</label>
                            <select
                              id={`${uid}-jenis`}
                              value={jenis}
                              onChange={(e) => {
                                setJenis(e.target.value);
                                setKategori(firstCategory(e.target.value));
                              }}
                            >
                              {(kind === "in" ? ctx.kinds.in : ctx.kinds.out).map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {ctx.programs.length ? (
                            <div className="field">
                              <label htmlFor={`${uid}-program`}>Program (opsional)</label>
                              <select id={`${uid}-program`} name="program_id_opsional" defaultValue="">
                                <option value="">Tanpa program</option>
                                {ctx.programs.map((p) => (
                                  <option key={p.value} value={p.value}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                      {owner ? (
                        <div className="field">
                          <label htmlFor={`${uid}-alasan`}>Alasan bila saldo akun tidak cukup</label>
                          <input ref={reasonRef} id={`${uid}-alasan`} name="alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Khusus pemilik, untuk penyesuaian" autoComplete="off" />
                        </div>
                      ) : null}
                    </div>
                  </>
                )}
              </>
            )}

          </div>

          <div className="kg-sheet-foot">
            {error ? (
              <p className="notice notice-danger kg-err" role="alert">
                {error}
              </p>
            ) : null}
            {view === "hapus" ? (
              <div className="kg-dfoot always">
                <button type="submit" className="btn kg-btn-danger solid" disabled={pending} aria-busy={pending || undefined}>
                  <KgIcon name="trash" size="s" />
                  {pending ? "Menghapus…" : "Hapus catatan"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => (panel.view === "hapus" && panel.back && row?.edit ? switchView({ view: "ubah", row: row! }) : onClose())}
                >
                  Batal
                </button>
              </div>
            ) : (
              <>
                <div className="kg-dfoot">
                  <button type="submit" className="btn" disabled={pending} aria-busy={pending || undefined}>
                    {pending ? "Menyimpan…" : view === "ubah" ? "Simpan perubahan" : "Simpan"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={onClose}>
                    Batal
                  </button>
                  <span className="kg-enter">Enter untuk simpan</span>
                </div>
                <div className="kg-pfoot">
                  <Keypad onKey={press} />
                  <button type="submit" className="btn btn-block kg-save" disabled={pending} aria-busy={pending || undefined}>
                    {pending ? "Menyimpan…" : saveLabel}
                  </button>
                </div>
              </>
            )}
          </div>
        </form>
        {cariSiswa && bisaSiswa ? <PilihSiswa students={ctx.students} current={siswa} onPick={pickStudent} onClose={() => setCariSiswa(false)} /> : null}
      </div>
    </>
  );
}

"use client";

// Kelola bidang presensi: tambah, ubah nama, sembunyikan/tampilkan, dan atur urutan (tombol naik/turun).
// Sesi menyimpan kode bidang, jadi ubah nama hanya mengganti label dan riwayat sesi tetap utuh.
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { aturBidangPresensi, tambahBidangPresensi } from "@/app/actions/pengaturan";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { PRESENSI_TYPE_NAME_MAX } from "@/lib/core/akademik";
import "./bidang.css";

export interface BidangRow {
  value: string;
  label: string;
  /** Nama bawaan atau nama saat bidang ditambahkan. */
  asli: string;
  hidden: boolean;
  dipakai: number;
  /** Bulan sesi terakhir, mis. "Agustus". */
  terakhir: string;
}

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** UUID v4 untuk ID operasi; tetap jalan di alamat http biasa (tanpa crypto.randomUUID). */
function operationId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function run(action: Action, fields: Record<string, string>): Promise<ActionState> {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  data.set("operation_id", operationId());
  try {
    return await action(initialActionState, data);
  } catch {
    return { ok: false, message: "Koneksi terputus. Periksa internet lalu coba lagi." };
  }
}

const usage = (row: BidangRow) => (row.dipakai ? `dipakai ${row.dipakai} sesi${row.hidden && row.terakhir ? ` · terakhir ${row.terakhir}` : ""}` : "belum dipakai");

function Arrow({ up }: { up: boolean }) {
  return (
    <svg className="bp-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

function Pencil() {
  return (
    <svg className="bp-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}

/** Lembar bawah (HP) / dialog (desktop). */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="bp-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bp-sheet-in">
        <div className="bp-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="bp-x" aria-label="Tutup" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}

export function BidangManager({ rows, addOperationId, editOperationId }: { rows: BidangRow[]; addOperationId: string; editOperationId: string }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BidangRow | null>(null);
  const closeAdd = useCallback(() => setAdding(false), []);
  const closeEdit = useCallback(() => setEditing(null), []);

  const shown = rows.filter((row) => !row.hidden);
  const hidden = rows.filter((row) => row.hidden);

  const act = (row: BidangRow, aksi: "naik" | "turun" | "tampil" | "sembunyi") => {
    if (aksi === "sembunyi" && shown.length <= 1) {
      setMessage({ ok: false, text: "Sisakan minimal satu bidang yang tampil saat membuat sesi." });
      return;
    }
    setBusy(`${row.value}:${aksi}`);
    setMessage(null);
    startTransition(async () => {
      const result = await run(aturBidangPresensi, { value: row.value, aksi });
      setMessage({ ok: result.ok, text: result.message });
      setBusy("");
    });
  };

  const addAction = useCallback(async (prev: ActionState, data: FormData) => {
    const result = await tambahBidangPresensi(prev, data);
    if (result.ok) {
      setAdding(false);
      setMessage({ ok: true, text: result.message });
    }
    return result;
  }, []);

  const editAction = useCallback(async (prev: ActionState, data: FormData) => {
    const result = await aturBidangPresensi(prev, data);
    if (result.ok) {
      setEditing(null);
      setMessage({ ok: true, text: result.message });
    }
    return result;
  }, []);

  const item = (row: BidangRow, index: number, list: BidangRow[]) => {
    const isBusy = busy.startsWith(`${row.value}:`);
    return (
      <li key={row.value} className={`bp-row${isBusy ? " is-busy" : ""}`}>
        {row.hidden ? null : (
          <span className="bp-move">
            <button type="button" className="bp-mv" aria-label={`Naikkan ${row.label}`} disabled={pending || index === 0} onClick={() => act(row, "naik")}>
              <Arrow up />
            </button>
            <button type="button" className="bp-mv" aria-label={`Turunkan ${row.label}`} disabled={pending || index === list.length - 1} onClick={() => act(row, "turun")}>
              <Arrow up={false} />
            </button>
          </span>
        )}
        <span className="bp-main">
          <b>{row.label}</b>
          <span className="n">{usage(row)}</span>
        </span>
        <button type="button" className="bp-tap" aria-label={`Ubah ${row.label}`} onClick={() => setEditing(row)}>
          <Pencil />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={!row.hidden}
          aria-label={`Tampilkan ${row.label} saat membuat sesi`}
          className={`bp-sw${row.hidden ? "" : " on"}`}
          disabled={pending}
          onClick={() => act(row, row.hidden ? "tampil" : "sembunyi")}
        />
      </li>
    );
  };

  return (
    <div className="bp">
      <section className="card bp-card">
        <div className="bp-head">
          <div>
            <h2>Bidang tersedia</h2>
            <p className="muted bp-sub">Urutan di sini sama dengan urutan pilihan Bidang di lembar Buat sesi.</p>
          </div>
          <button type="button" className="btn btn-sm bp-add" onClick={() => setAdding(true)} aria-haspopup="dialog">
            <Icon name="plus" />
            Tambah
          </button>
        </div>
        {message ? (
          <p className={`notice ${message.ok ? "notice-success" : "notice-danger"}`} role={message.ok ? "status" : "alert"}>
            {message.text}
          </p>
        ) : null}
        <ul className="bp-list">{shown.map((row, index) => item(row, index, shown))}</ul>
      </section>

      {hidden.length ? (
        <section className="card bp-card bp-hidden">
          <div className="bp-head">
            <div>
              <h2>
                Disembunyikan <span className="badge">{hidden.length}</span>
              </h2>
              <p className="muted bp-sub">Tidak muncul saat membuat sesi baru. Riwayat sesi lama tetap aman dan tetap memakai nama ini.</p>
            </div>
          </div>
          <ul className="bp-list">{hidden.map((row, index) => item(row, index, hidden))}</ul>
        </section>
      ) : null}

      <Sheet open={adding} onClose={closeAdd} title="Tambah bidang">
        <ActionForm action={addAction} operationId={addOperationId} resetOnSuccess className="stack">
          <Field label="Nama bidang" name="nama" placeholder="Mis. Wawancara" maxLength={PRESENSI_TYPE_NAME_MAX} required autoFocus />
          <div className="form-actions">
            <SubmitButton>Tambah bidang</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>

      <Sheet open={Boolean(editing)} onClose={closeEdit} title="Ubah bidang">
        {editing ? (
          <ActionForm key={editing.value} action={editAction} operationId={editOperationId} className="stack">
            <input type="hidden" name="value" value={editing.value} />
            <input type="hidden" name="aksi" value="ubah" />
            <div className="stack bp-name">
              <Field label="Nama bidang" name="nama" defaultValue={editing.label} maxLength={PRESENSI_TYPE_NAME_MAX} required />
              {editing.label !== editing.asli ? (
                <span className="hint">
                  Nama awal: <s>{editing.asli}</s>. Isi dengan nama awal untuk mengembalikannya.
                </span>
              ) : null}
            </div>
            <p className="bp-note">
              <Icon name="clipboard" />
              <span>
                {editing.dipakai ? (
                  <>
                    Dipakai di <b>{editing.dipakai} sesi</b>. Sesi lama tetap tersimpan lengkap dengan presensinya, dan ikut tampil dengan nama baru.
                  </>
                ) : (
                  "Belum dipakai sesi mana pun."
                )}
              </span>
            </p>
            <label className="bp-tg">
              <span>
                <b>Tampilkan saat membuat sesi</b>
                <span className="muted">Matikan untuk menyembunyikan tanpa menghapus.</span>
              </span>
              <input type="checkbox" role="switch" name="tampil" className="bp-switch" defaultChecked={!editing.hidden} />
            </label>
            <div className="form-actions">
              <SubmitButton>Simpan perubahan</SubmitButton>
            </div>
            <p className="hint bp-center">Bidang yang sudah dipakai tidak bisa dihapus, hanya disembunyikan.</p>
          </ActionForm>
        ) : null}
      </Sheet>
    </div>
  );
}

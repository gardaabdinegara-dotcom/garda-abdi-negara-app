"use client";

// Penyunting template pesan WA: pilih jenis, ketuk isian untuk menyisipkan {kode}, lihat pratinjau langsung,
// lalu simpan atau kembalikan ke teks bawaan.
import { useCallback, useId, useRef, useState } from "react";
import { simpanTemplateWa } from "@/app/actions/pengaturan";
import { ActionForm, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icon";
import type { ActionState } from "@/lib/action-state";
import { isiTemplate, type WaJenis } from "@/lib/core/wa";
import "./pesan-wa.css";

export interface TemplateView {
  jenis: WaJenis;
  label: string;
  /** Teks yang berlaku sekarang (isian owner atau bawaan). */
  teks: string;
  bawaan: string;
  /** true = owner sudah mengubah teks bawaan. */
  custom: boolean;
  fields: { kode: string; ket: string }[];
  /** Contoh data fiktif untuk pratinjau. */
  contoh: Record<string, string>;
}

/** UUID v4 untuk ID operasi; tetap jalan di alamat http biasa (tanpa crypto.randomUUID). */
function newId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const unknownCodes = (text: string, fields: { kode: string }[]) => {
  const known = new Set(fields.map((f) => f.kode));
  return [...new Set([...text.matchAll(/\{([^{}\s]*)\}/g)].map((m) => m[1]!))].filter((kode) => !known.has(kode));
};

export function PesanWaEditor({
  templates,
  initial,
  editable,
  max,
  operationId,
  resetOperationId,
}: {
  templates: TemplateView[];
  initial: WaJenis;
  editable: boolean;
  max: number;
  operationId: string;
  resetOperationId: string;
}) {
  const [jenis, setJenis] = useState<WaJenis>(initial);
  // Form tiap jenis dipasang ulang saat tab berganti; masing-masing memakai ID operasi baru.
  const [ids, setIds] = useState({ simpan: operationId, bawaan: resetOperationId });
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(templates.map((t) => [t.jenis, t.teks])));
  const area = useRef<HTMLTextAreaElement>(null);
  const areaId = useId();
  const tpl = templates.find((t) => t.jenis === jenis) ?? templates[0]!;
  const draft = drafts[tpl.jenis] ?? tpl.teks;
  const unknown = unknownCodes(draft, tpl.fields);
  const changed = draft.trim() !== tpl.teks;
  const isDefault = draft.trim() === tpl.bawaan;

  const setDraft = (text: string) => setDrafts((d) => ({ ...d, [tpl.jenis]: text }));

  const insert = (kode: string) => {
    const el = area.current;
    const token = `{${kode}}`;
    if (!el) return setDraft(`${draft}${token}`);
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = `${draft.slice(0, start)}${token}${draft.slice(end)}`;
    if (next.length > max) return;
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const resetAction = useCallback(
    async (prev: ActionState, data: FormData) => {
      const result = await simpanTemplateWa(prev, data);
      if (result.ok) setDrafts((d) => ({ ...d, [tpl.jenis]: tpl.bawaan }));
      return result;
    },
    [tpl.jenis, tpl.bawaan],
  );

  return (
    <div className="pw">
      <div className="pw-seg" role="tablist" aria-label="Jenis pesan">
        {templates.map((t) => (
          <button
            key={t.jenis}
            type="button"
            role="tab"
            aria-selected={t.jenis === jenis}
            className={t.jenis === jenis ? "on" : undefined}
            onClick={() => {
              if (t.jenis === jenis) return;
              setJenis(t.jenis);
              setIds({ simpan: newId(), bawaan: newId() });
            }}
          >
            {t.label}
            {drafts[t.jenis]?.trim() !== t.teks ? <i className="pw-dot" aria-label="belum disimpan" /> : null}
          </button>
        ))}
      </div>

      <div className="pw-grid">
        <section className="card pw-card" aria-label={`Template ${tpl.label}`}>
          <div className="pw-head">
            <h2>Template {tpl.label}</h2>
            <span className={`badge${tpl.custom ? " badge-info" : ""}`}>{tpl.custom ? "Sudah diubah" : "Teks bawaan"}</span>
          </div>
          <ActionForm key={`simpan:${tpl.jenis}`} action={simpanTemplateWa} operationId={ids.simpan} className="stack">
            <input type="hidden" name="jenis" value={tpl.jenis} />
            <input type="hidden" name="aksi" value="simpan" />
            <div className="field">
              <label htmlFor={areaId}>Teks pesan</label>
              <textarea
                id={areaId}
                ref={area}
                name="teks"
                rows={8}
                maxLength={max}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={!editable}
                aria-describedby={`${areaId}-n`}
              />
              <span className="hint pw-count n" id={`${areaId}-n`}>
                {draft.length}/{max} karakter. Kata dalam kurung kurawal diisi otomatis.
              </span>
            </div>
            <div className="pw-fields">
              <span className="pw-label">Isian otomatis {editable ? "(ketuk untuk menyisipkan)" : ""}</span>
              <div className="pw-chips">
                {tpl.fields.map((f) => (
                  <button key={f.kode} type="button" className="pw-chip" onClick={() => insert(f.kode)} disabled={!editable} title={f.ket}>
                    <code>{`{${f.kode}}`}</code>
                    <span>{f.ket}</span>
                  </button>
                ))}
              </div>
            </div>
            {unknown.length ? (
              <p className="notice notice-warning" role="alert">
                Isian {unknown.map((k) => `{${k}}`).join(", ")} tidak dikenal dan tidak akan terisi. Pakai isian dari daftar di atas.
              </p>
            ) : null}
            {editable ? (
              <div className="form-actions">
                <SubmitButton>Simpan template</SubmitButton>
                {changed ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft(tpl.teks)}>
                    Batalkan perubahan
                  </button>
                ) : null}
              </div>
            ) : null}
          </ActionForm>
          {editable && (tpl.custom || !isDefault) ? (
            <ActionForm
              key={`bawaan:${tpl.jenis}`}
              action={resetAction}
              operationId={ids.bawaan}
              confirm={`Kembalikan template ${tpl.label} ke teks bawaan? Teks yang sudah diubah akan diganti.`}
              className="pw-reset"
            >
              <input type="hidden" name="jenis" value={tpl.jenis} />
              <input type="hidden" name="aksi" value="bawaan" />
              <button type="submit" className="btn btn-secondary btn-sm">
                Kembalikan bawaan
              </button>
            </ActionForm>
          ) : null}
        </section>

        <section className="card pw-card pw-preview" aria-label="Pratinjau pesan">
          <div className="pw-head">
            <h2>Pratinjau</h2>
            <span className="muted pw-small">contoh data fiktif</span>
          </div>
          <div className="pw-chat">
            <div className="pw-bubble">{isiTemplate(draft, tpl.contoh) || " "}</div>
          </div>
          <p className="pw-note">
            <Icon name="wa" />
            <span>Pesan dibuka di WhatsApp lewat tombol WA (mis. Presensi → Rekap). Belum ada yang terkirim sampai Anda menekan kirim di WhatsApp.</span>
          </p>
        </section>
      </div>
    </div>
  );
}

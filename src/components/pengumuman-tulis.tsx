"use client";

// Lembar "Tulis pengumuman" / "Ubah pengumuman" (owner). Opsi "Kirim juga lewat WA" tidak mengirim apa pun sendiri:
// setelah terbit, tombol WA membuka WhatsApp dengan teks siap kirim, owner memilih grupnya.
import { useCallback, useId, useState } from "react";
import { simpanPengumumanAction } from "@/app/actions/pengumuman";
import type { ActionState } from "@/lib/action-state";
import { PENGUMUMAN_HARI_MAX, PENGUMUMAN_ISI_MAX, PENGUMUMAN_JUDUL_MAX, panjangIsi, tambahHari, teksWaPengumuman } from "@/lib/core/pengumuman-teks";
import { ActionForm, SubmitButton, useFieldError } from "./form";
import { Icon } from "./icon";
import { Lembar } from "./lembar";
import { WaKabari } from "./wa";
import "./pengumuman.css";

export interface PengumumanAwal {
  pengumuman_id: string;
  judul: string;
  isi: string;
  tampil_sampai: string;
  disematkan: boolean;
}

function Galat({ name, id }: { name: string; id: string }) {
  const error = useFieldError(name);
  return error ? (
    <span className="field-error" id={id}>
      {error}
    </span>
  ) : null;
}

function Isian({ awal, today, wa, setWa, judul, setJudul, isi, setIsi }: { awal?: PengumumanAwal; today: string; wa: boolean; setWa: (v: boolean) => void; judul: string; setJudul: (v: string) => void; isi: string; setIsi: (v: string) => void }) {
  const id = useId();
  const judulError = useFieldError("judul");
  const isiError = useFieldError("isi");
  const tanggalError = useFieldError("tampil_sampai");
  const panjang = panjangIsi(isi);
  return (
    <>
      {awal ? <input type="hidden" name="pengumuman_id" value={awal.pengumuman_id} /> : null}
      <div className="field">
        <label htmlFor={`${id}-judul`}>
          Judul<span className="muted"> *</span>
        </label>
        <input
          id={`${id}-judul`}
          name="judul"
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          maxLength={PENGUMUMAN_JUDUL_MAX}
          placeholder="mis. Tes Samapta III"
          autoComplete="off"
          required
          aria-invalid={judulError ? true : undefined}
          aria-describedby={judulError ? `${id}-judul-e` : undefined}
        />
        <Galat name="judul" id={`${id}-judul-e`} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-isi`}>
          Isi<span className="muted"> *</span>
        </label>
        <textarea
          id={`${id}-isi`}
          name="isi"
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          maxLength={PENGUMUMAN_ISI_MAX}
          rows={4}
          placeholder="Waktu, tempat, dan apa yang perlu dibawa."
          required
          aria-invalid={isiError ? true : undefined}
          aria-describedby={`${id}-isi-h`}
        />
        <span className={`hint png-hitung${panjang > PENGUMUMAN_ISI_MAX - 40 ? " is-hampir" : ""}`} id={`${id}-isi-h`} aria-live="polite">
          {panjang} / {PENGUMUMAN_ISI_MAX} karakter
        </span>
        <Galat name="isi" id={`${id}-isi-e`} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-sampai`}>Tampil sampai</label>
        <input
          id={`${id}-sampai`}
          name="tampil_sampai"
          type="date"
          defaultValue={awal?.tampil_sampai && awal.tampil_sampai >= today ? awal.tampil_sampai : tambahHari(today, 7)}
          min={today}
          max={tambahHari(today, PENGUMUMAN_HARI_MAX)}
          required
          aria-invalid={tanggalError ? true : undefined}
          aria-describedby={`${id}-sampai-h`}
        />
        <span className="hint" id={`${id}-sampai-h`}>
          Setelah tanggal ini, info hilang sendiri dari beranda siswa.
        </span>
        <Galat name="tampil_sampai" id={`${id}-sampai-e`} />
      </div>
      <label className="png-tg">
        <span>
          <b>Sematkan di atas</b>
          <small>Selalu tampil paling atas di beranda siswa.</small>
        </span>
        <input type="checkbox" name="disematkan" role="switch" defaultChecked={awal?.disematkan ?? false} />
      </label>
      <label className="png-tg">
        <span>
          <b>
            Kirim juga lewat WA <em>opsional</em>
          </b>
          <small>Membuka WhatsApp dengan teks siap kirim ke grup.</small>
        </span>
        <input type="checkbox" role="switch" checked={wa} onChange={(e) => setWa(e.target.checked)} />
      </label>
    </>
  );
}

/**
 * Tombol + lembar tulis/ubah pengumuman. `awal` diisi = mode ubah.
 * ID operasi dibuat saat lembar pertama dibuka dan diganti setelah berhasil, jadi kirim ulang tidak menggandakan.
 */
export function TulisPengumuman({ awal, today, tombol = "besar" }: { awal?: PengumumanAwal; today: string; tombol?: "besar" | "kecil" }) {
  const [open, setOpen] = useState(false);
  const [opId, setOpId] = useState<string | null>(null);
  const [wa, setWa] = useState(false);
  const [judul, setJudul] = useState(awal?.judul ?? "");
  const [isi, setIsi] = useState(awal?.isi ?? "");
  const [terbit, setTerbit] = useState<{ judul: string; isi: string } | null>(null);

  function buka() {
    setOpId((id) => id ?? crypto.randomUUID());
    setTerbit(null);
    setOpen(true);
  }

  const action = useCallback(
    async (prev: ActionState, data: FormData) => {
      const result = await simpanPengumumanAction(prev, data);
      if (result.ok) {
        const kirim = { judul: String(data.get("judul") ?? ""), isi: String(data.get("isi") ?? "") };
        // Form berikutnya mulai bersih dengan ID operasi baru.
        setOpId(null);
        if (!awal) {
          setJudul("");
          setIsi("");
        }
        if (wa) setTerbit(kirim);
        else setOpen(false);
      }
      return result;
    },
    [awal, wa],
  );

  const ubah = Boolean(awal);
  return (
    <>
      {tombol === "besar" ? (
        <button type="button" className="btn png-tulis" aria-haspopup="dialog" onClick={buka}>
          <Icon name="plus" />
          Tulis pengumuman
        </button>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" aria-haspopup="dialog" onClick={buka}>
          Ubah
        </button>
      )}
      <Lembar open={open} onClose={() => setOpen(false)} title={terbit ? (ubah ? "Pengumuman diperbarui" : "Pengumuman terbit") : ubah ? "Ubah pengumuman" : "Pengumuman baru"} sub={terbit ? "Sudah tampil di beranda siswa. Lanjutkan ke WhatsApp bila ingin dikirim ke grup." : undefined}>
        {terbit ? (
          <div className="stack png-terbit">
            <div className="png-bubble">{teksWaPengumuman(terbit)}</div>
            <WaKabari nomor={null} tanpaNomorBoleh pesan={teksWaPengumuman(terbit)} label="Buka WhatsApp" ukuran="md" judul="Kirim ke grup WhatsApp" untuk="Pilih grup atau chat di WhatsApp" />
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Selesai
            </button>
          </div>
        ) : opId ? (
          <ActionForm key={opId} action={action} operationId={opId} className="stack png-form">
            <Isian awal={awal} today={today} wa={wa} setWa={setWa} judul={judul} setJudul={setJudul} isi={isi} setIsi={setIsi} />
            <div className="lembar-foot">
              <SubmitButton pendingLabel="Menerbitkan…">{ubah ? (wa ? "Simpan dan buka WA" : "Simpan perubahan") : wa ? "Terbitkan dan buka WA" : "Terbitkan"}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Lembar>
    </>
  );
}

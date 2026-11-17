"use client";

import { useId, useState } from "react";
import { useFieldError } from "./form";

export interface ProgramOption {
  program_id: string;
  nama_program: string;
  /** Tarif program dari spreadsheet Keuangan; null bila pengguna tidak punya akses keuangan. */
  skema: string | null;
  tarif: number | null;
}

const rupiahText = (n: number) => (n ? n.toLocaleString("id-ID") : "");

/**
 * Isian pendaftaran terpadu: program, kelas, tanggal mulai, lalu (bila boleh mencatat keuangan)
 * ketentuan biaya dan tagihan pertama. Nilai bawaan biaya mengikuti tarif program yang dipilih.
 */
export function EnrollmentSetup({
  programs,
  classes,
  today,
  finance,
  owner,
  optional,
}: {
  programs: ProgramOption[];
  classes: { kelas_id: string; nama_kelas: string; program_id: string }[];
  today: string;
  finance: boolean;
  owner: boolean;
  optional: boolean;
}) {
  const id = useId();
  const [program, setProgram] = useState(optional ? "" : (programs[0]?.program_id ?? ""));
  const chosen = programs.find((p) => p.program_id === program);
  const [scheme, setScheme] = useState(chosen?.skema ?? "PAKET");
  const [tariff, setTariff] = useState(rupiahText(chosen?.tarif ?? 0));
  const [start, setStart] = useState(today);
  const [issue, setIssue] = useState(true);
  const [withFee, setWithFee] = useState(Boolean(chosen?.tarif));
  const available = classes.filter((c) => c.program_id === program);
  const errors = { program: useFieldError("program_id"), kelas: useFieldError("kelas_id") };

  function pick(value: string) {
    setProgram(value);
    const next = programs.find((p) => p.program_id === value);
    setScheme(next?.skema ?? "PAKET");
    setTariff(rupiahText(next?.tarif ?? 0));
    setWithFee(Boolean(next?.tarif));
  }

  return (
    <div className="stack">
      <div className="form-grid three">
        <div className="field">
          <label htmlFor={`${id}-program`}>Program</label>
          <select id={`${id}-program`} name="program_id" value={program} onChange={(e) => pick(e.target.value)} aria-invalid={errors.program ? true : undefined}>
            {optional ? <option value="">Daftarkan nanti</option> : null}
            {programs.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.nama_program}
              </option>
            ))}
          </select>
          {errors.program ? <span className="field-error">{errors.program}</span> : null}
        </div>
        <div className="field">
          <label htmlFor={`${id}-kelas`}>Kelas</label>
          <select id={`${id}-kelas`} name="kelas_id" key={program} disabled={!program || available.length === 0} aria-invalid={errors.kelas ? true : undefined}>
            {!program ? <option value="">Pilih program dulu</option> : available.length === 0 ? <option value="">Belum ada kelas aktif</option> : null}
            {available.map((c) => (
              <option key={c.kelas_id} value={c.kelas_id}>
                {c.nama_kelas}
              </option>
            ))}
          </select>
          {errors.kelas ? <span className="field-error">{errors.kelas}</span> : null}
        </div>
        <div className="field">
          <label htmlFor={`${id}-mulai`}>Tanggal mulai</label>
          <input id={`${id}-mulai`} type="date" name="tanggal_mulai" value={start} onChange={(e) => setStart(e.target.value)} disabled={!program} />
        </div>
      </div>

      {finance && program ? (
        <label className="check">
          <input type="checkbox" checked={withFee} onChange={(e) => setWithFee(e.target.checked)} />
          Atur biaya pendaftaran sekarang
        </label>
      ) : null}
      {finance && program && withFee ? (
        <fieldset className="fieldset-plain stack setup-finance">
          <input type="hidden" name="atur_biaya" value="1" />
          <span className="field-label">Biaya pendaftaran</span>
          <div className="form-grid three">
            <div className="field">
              <label htmlFor={`${id}-skema`}>Skema</label>
              <select id={`${id}-skema`} name="skema_biaya" value={scheme} onChange={(e) => setScheme(e.target.value)}>
                <option value="PAKET">Paket (boleh dicicil)</option>
                <option value="BULANAN">Bulanan</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-tarif`}>Tarif disepakati</label>
              <input id={`${id}-tarif`} name="tarif_disepakati" inputMode="numeric" placeholder="Rp" value={tariff} onChange={(e) => setTariff(e.target.value)} readOnly={!owner} />
              <span className="hint">
                {chosen?.tarif ? `Tarif program Rp${chosen.tarif.toLocaleString("id-ID")}.` : "Tarif program belum diatur."} {owner ? "Tarif khusus boleh diubah pemilik." : "Tarif khusus hanya oleh pemilik."}
              </span>
            </div>
            {scheme === "BULANAN" ? (
              <div className="field">
                <label htmlFor={`${id}-hari`}>Jatuh tempo tiap tanggal</label>
                <input id={`${id}-hari`} type="number" name="hari_jatuh_tempo" min={1} max={31} defaultValue={10} />
              </div>
            ) : (
              <input type="hidden" name="hari_jatuh_tempo" value="10" />
            )}
          </div>
          <label className="check">
            <input type="checkbox" name="terbitkan" checked={issue} onChange={(e) => setIssue(e.target.checked)} />
            Terbitkan tagihan pertama sekarang
          </label>
          {issue ? (
            <div className="form-grid three">
              <div className="field">
                <label htmlFor={`${id}-terbit`}>Tanggal terbit</label>
                <input id={`${id}-terbit`} type="date" name="tanggal_terbit" defaultValue={today} />
              </div>
              {scheme === "PAKET" ? (
                <>
                  <div className="field">
                    <label htmlFor={`${id}-cicilan`}>Jumlah cicilan</label>
                    <input id={`${id}-cicilan`} type="number" name="cicilan" min={1} max={24} defaultValue={1} />
                  </div>
                  <div className="field">
                    <label htmlFor={`${id}-tempo`}>Jatuh tempo pertama</label>
                    <input id={`${id}-tempo`} type="date" name="jatuh_tempo_pertama" />
                    <span className="hint">Kosong = tanggal terbit.</span>
                  </div>
                </>
              ) : (
                <div className="field">
                  <label htmlFor={`${id}-periode`}>Bulan layanan</label>
                  <input id={`${id}-periode`} type="month" name="periode_layanan" defaultValue={(start || today).slice(0, 7)} key={start} />
                </div>
              )}
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}

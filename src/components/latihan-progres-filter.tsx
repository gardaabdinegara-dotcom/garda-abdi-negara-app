"use client";

import Form from "next/form";
import { useEffect, useRef } from "react";
import { DURASI_LABEL, DURASI_LATIHAN, JENIS_INFO, JENIS_LATIHAN } from "@/lib/core/latihan";
import type { PilihanRekap } from "@/lib/latihan-rekap-route";

export function RekapFilter({ pilihan }: { pilihan: PilihanRekap }) {
  const jenis = useRef<HTMLSelectElement>(null);
  const durasi = useRef<HTMLSelectElement>(null);

  // Ikuti navigasi URL (misalnya tombol kembali) tanpa mengganti elemen yang sedang difokuskan.
  useEffect(() => {
    if (jenis.current) jenis.current.value = pilihan.jenis ?? "";
    if (durasi.current) durasi.current.value = pilihan.durasi ?? "";
  }, [pilihan]);

  return (
    <Form action="/latihan" className="lp-monitor-selects" scroll={false} prefetch={false} onChange={(event) => event.currentTarget.requestSubmit()}>
      <input type="hidden" name="periode" value={pilihan.periode} />
      {pilihan.grafik === "skor" ? <input type="hidden" name="grafik" value="skor" /> : null}
      {pilihan.tanda ? <input type="hidden" name="tanda" value={pilihan.tanda} /> : null}
      {pilihan.siswa ? <input type="hidden" name="siswa" value={pilihan.siswa} /> : null}
      {pilihan.target ? <input type="hidden" name="target" value={pilihan.target} /> : null}
      <div className="lp-monitor-field">
        <label htmlFor="latihan-rekap-jenis">Jenis latihan</label>
        <select id="latihan-rekap-jenis" name="jenis" ref={jenis} defaultValue={pilihan.jenis ?? ""}>
          <option value="">Semua jenis</option>
          {JENIS_LATIHAN.map((value) => <option key={value} value={value}>{JENIS_INFO[value].nama}</option>)}
        </select>
      </div>
      <div className="lp-monitor-field">
        <label htmlFor="latihan-rekap-durasi">Durasi</label>
        <select id="latihan-rekap-durasi" name="durasi" ref={durasi} defaultValue={pilihan.durasi ?? ""}>
          <option value="">Semua durasi</option>
          {DURASI_LATIHAN.map((value) => <option key={value} value={value}>{DURASI_LABEL[value]}</option>)}
        </select>
      </div>
      <noscript><button type="submit" className="btn btn-secondary">Terapkan</button></noscript>
    </Form>
  );
}

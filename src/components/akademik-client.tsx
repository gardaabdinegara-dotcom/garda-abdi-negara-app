"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { COMPONENTS, FITNESS_UNIT, SKD_MAX, TEST_CATEGORIES, TEST_CATEGORY_LABEL, type TestCategory } from "@/lib/core/akademik";
import { Field } from "./form";

/** Memuat ulang data halaman secara berkala (mis. QR presensi dan daftar pengajuan). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function PrintButton({ label = "Cetak / simpan PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
      {label}
    </button>
  );
}

/** Isian hasil tes yang menyesuaikan bidang: SKD (TWK/TIU/TKP) atau komponen dengan skor 0–100. */
export function TestFields({ today }: { today: string }) {
  const [category, setCategory] = useState<TestCategory>("SKD");
  const components = category === "SKD" ? [] : Object.entries(COMPONENTS[category]);
  const [component, setComponent] = useState<string>("");
  const selected = components.some(([key]) => key === component) ? component : (components[0]?.[0] ?? "");
  return (
    <div className="form-grid two">
      <div className="field">
        <label htmlFor="kategori-tes">Bidang</label>
        <select id="kategori-tes" name="kategori" value={category} onChange={(e) => setCategory(e.target.value as TestCategory)}>
          {TEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TEST_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <Field label="Tanggal tes" name="tanggal" type="date" defaultValue={today} required />
      {category === "SKD" ? (
        <>
          <Field label="Nama tes" name="nama_tes" placeholder="mis. Tryout 3" className="span-all" />
          <Field label={`TWK (0–${SKD_MAX.twk})`} name="twk" type="number" inputMode="numeric" min={0} max={SKD_MAX.twk} required />
          <Field label={`TIU (0–${SKD_MAX.tiu})`} name="tiu" type="number" inputMode="numeric" min={0} max={SKD_MAX.tiu} required />
          <Field label={`TKP (0–${SKD_MAX.tkp})`} name="tkp" type="number" inputMode="numeric" min={0} max={SKD_MAX.tkp} required />
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="komponen-tes">Komponen</label>
            <select id="komponen-tes" name="komponen" value={selected} onChange={(e) => setComponent(e.target.value)}>
              {components.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <Field label="Skor (0–100)" name="skor" type="number" inputMode="numeric" min={0} max={100} required />
          {category === "FISIK" ? (
            <>
              <Field label={`Hasil asli (${FITNESS_UNIT[selected] ?? ""})`} name="hasil_mentah" type="number" inputMode="numeric" required />
              <Field label="Protokol / sumber skor" name="protokol" placeholder="Penilaian pengajar GAN" />
            </>
          ) : null}
        </>
      )}
      <Field label="Catatan" name="catatan" className="span-all" />
    </div>
  );
}

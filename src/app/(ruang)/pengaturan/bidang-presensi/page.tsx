import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { tambahBidangPresensi } from "@/app/actions/pengaturan";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { PageHead } from "@/components/ui";
import { PRESENSI_TYPE_NAME_MAX } from "@/lib/core/akademik";
import { loadSessionTypes } from "@/lib/server/akademik";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Bidang presensi" };

export default async function SessionTypesPage() {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const options = await loadSessionTypes();

  return (
    <div className="page">
      <PageHead eyebrow="Pengaturan" title="Bidang presensi" description="Pilihan bidang yang tampil saat membuat atau mengubah sesi Presensi." />
      <SettingsTabs current="bidang-presensi" owner={actor.user.peran === "OWNER"} />
      <div className="grid-2">
        <section className="card">
          <h2>Tambah bidang</h2>
          <ActionForm action={tambahBidangPresensi} operationId={randomUUID()} resetOnSuccess className="stack">
            <Field label="Nama bidang" name="nama" placeholder="Mis. Wawancara" maxLength={PRESENSI_TYPE_NAME_MAX} required />
            <div className="form-actions">
              <SubmitButton>Tambah bidang</SubmitButton>
            </div>
          </ActionForm>
        </section>
        <section className="card">
          <h2>Bidang tersedia</h2>
          <ul className="item-list session-type-list">
            {options.map(({ value, label }) => (
              <li className="item" key={value}>{label}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

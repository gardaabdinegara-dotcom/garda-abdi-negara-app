import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { gantiPassword, keluar } from "@/app/actions/auth";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Wordmark } from "@/components/shell";
import { UjiSiswaBanner } from "@/components/uji-siswa-banner";
import { PIN_LENGTH } from "@/lib/core/pin";
import { PIN_SISWA_UJI } from "@/lib/demo/siswa-uji";
import { getUjiSiswa, requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Ganti password" };

export default async function ChangePasswordPage() {
  const actor = await requireActor({ allowPasswordChange: true });
  if (actor.user.peran === "SISWA") {
    const test = await getUjiSiswa();
    return <ChangePin testId={test?.status === "aktif" ? test.id : undefined} initial={actor.user.versi_otorisasi === 1} />;
  }
  const forced = actor.user.wajib_ganti_password;

  return (
    <div className="standalone">
      <Wordmark />
      <section className="card">
        <div className="card-head">
          <div>
            <h2>{forced ? "Buat password baru" : "Ganti password"}</h2>
            <p>
              {forced
                ? "Anda masuk dengan password sementara. Ganti dulu sebelum memakai Ruang Garda."
                : "Semua perangkat lain akan otomatis keluar setelah password diganti."}
            </p>
          </div>
        </div>
        <ActionForm action={gantiPassword} operationId={randomUUID()} className="stack">
          <input type="text" name="username" autoComplete="username" defaultValue={actor.user.username} hidden readOnly />
          <Field label={forced ? "Password sementara" : "Password saat ini"} name="password_lama" type="password" autoComplete="current-password" required />
          <Field
            label="Password baru"
            name="password_baru"
            type="password"
            autoComplete="new-password"
            hint="Bebas, asal berbeda dari password sekarang."
            required
          />
          <Field label="Ulangi password baru" name="password_ulang" type="password" autoComplete="new-password" required />
          <div className="form-actions">
            <SubmitButton>Simpan password</SubmitButton>
            {forced ? null : (
              <Link href="/akun-saya" className="btn btn-secondary">
                Batal
              </Link>
            )}
          </div>
        </ActionForm>
      </section>
      <form action={keluar}>
        <button type="submit" className="btn btn-ghost">
          Keluar
        </button>
      </form>
    </div>
  );
}

/** Siswa mengganti PIN 6 angka; memakai aksi yang sama (kolom password_* berisi PIN). */
function ChangePin({ testId, initial }: { testId?: string; initial: boolean }) {
  return (
    <div className="standalone">
      <Wordmark />
      {testId ? <UjiSiswaBanner id={testId} /> : null}
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Ganti PIN</h2>
            <p>{testId ? "Perubahan PIN berlaku untuk Siswa Uji dalam sesi ini." : "Perangkat lain akan otomatis keluar setelah PIN diganti."}</p>
            {testId && initial ? <p>PIN awal akun uji adalah <b>{PIN_SISWA_UJI}</b>.</p> : null}
          </div>
        </div>
        <ActionForm action={gantiPassword} operationId={randomUUID()} className="stack">
          <Field label="PIN saat ini" name="password_lama" type="password" inputMode="numeric" maxLength={PIN_LENGTH} autoComplete="current-password" required />
          <Field
            label="PIN baru"
            name="password_baru"
            type="password"
            inputMode="numeric"
            pattern={`\\d{${PIN_LENGTH}}`}
            maxLength={PIN_LENGTH}
            autoComplete="new-password"
            hint={`${PIN_LENGTH} angka, bukan angka yang sama semua dan bukan urutan seperti 123456.`}
            required
          />
          <Field label="Ulangi PIN baru" name="password_ulang" type="password" inputMode="numeric" pattern={`\\d{${PIN_LENGTH}}`} maxLength={PIN_LENGTH} autoComplete="new-password" required />
          <div className="form-actions">
            <SubmitButton>Simpan PIN</SubmitButton>
            <Link href="/akun-saya" className="btn btn-secondary">
              Batal
            </Link>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

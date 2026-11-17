import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { buatPin } from "@/app/actions/auth";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Wordmark } from "@/components/shell";
import { PIN_LENGTH } from "@/lib/core/pin";
import { pinSetupTarget } from "@/lib/server/pin";
import { getActor, safeNext } from "@/lib/server/session";

export const metadata: Metadata = { title: "Buat PIN" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Siswa membuat PIN saat masuk pertama kali, atau setelah PIN-nya direset admin. */
export default async function CreatePinPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const username = typeof params.akun === "string" ? params.akun.trim().toLowerCase() : "";
  const next = safeNext(params.lanjut);
  if (await getActor()) redirect(next ?? "/beranda");
  const user = await pinSetupTarget(username);
  if (!user) redirect("/masuk");

  return (
    <div className="standalone">
      <Wordmark />
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Buat PIN</h2>
            <p>
              Akun <b className="mono">{user.username}</b> · {user.nama}. Buat PIN {PIN_LENGTH} angka untuk masuk berikutnya. Jangan beri tahu PIN ke orang lain.
            </p>
          </div>
        </div>
        <ActionForm action={buatPin} operationId={randomUUID()} className="stack">
          <input type="text" name="username" autoComplete="username" defaultValue={user.username} hidden readOnly />
          {next ? <input type="hidden" name="lanjut" value={next} /> : null}
          <Field
            label="PIN baru"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern={`\\d{${PIN_LENGTH}}`}
            maxLength={PIN_LENGTH}
            autoComplete="new-password"
            hint={`${PIN_LENGTH} angka, bukan angka yang sama semua dan bukan urutan seperti 123456.`}
            required
            autoFocus
          />
          <Field label="Ulangi PIN" name="pin_ulang" type="password" inputMode="numeric" pattern={`\\d{${PIN_LENGTH}}`} maxLength={PIN_LENGTH} autoComplete="new-password" required />
          <div className="form-actions">
            <SubmitButton pendingLabel="Menyimpan…">Simpan PIN dan masuk</SubmitButton>
            <Link href="/masuk" className="btn btn-secondary">
              Bukan akun saya
            </Link>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}

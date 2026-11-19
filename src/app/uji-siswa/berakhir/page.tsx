import { redirect } from "next/navigation";
import { aturUlangUjiSiswa, kembaliDariUjiSiswa } from "@/app/actions/uji-siswa";
import { Wordmark } from "@/components/shell";
import { canTestAsStudent } from "@/lib/auth/uji-siswa";
import { getLogin, getUjiSiswa } from "@/lib/server/session";

export default async function UjiSiswaBerakhir() {
  const login = await getLogin();
  if (!login) redirect("/masuk");
  const test = await getUjiSiswa();
  if (test?.status !== "berakhir") redirect("/beranda");
  return (
    <div className="standalone">
      <Wordmark />
      <section className="card stack">
        <div className="card-head">
          <div>
            <h1>Sesi uji berakhir</h1>
            <p>Mulai dari data contoh yang baru atau kembali ke akun Anda.</p>
          </div>
        </div>
        <div className="row">
          {canTestAsStudent(login.actor.user) ? (
            <form action={aturUlangUjiSiswa.bind(null, null)}>
              <button className="btn" type="submit">Mulai uji baru</button>
            </form>
          ) : null}
          <form action={kembaliDariUjiSiswa.bind(null, null)}>
            <button className="btn btn-secondary" type="submit">Kembali ke akun saya</button>
          </form>
        </div>
      </section>
    </div>
  );
}

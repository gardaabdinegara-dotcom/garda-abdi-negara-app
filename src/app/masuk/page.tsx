import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { masuk, masukCepat } from "@/app/actions/auth";
import { AppInstallButton } from "@/components/app-install";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { Wordmark } from "@/components/shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoleBadge } from "@/components/ui";
import { quickLoginAllowed, quickLoginUsers } from "@/lib/auth/quick-login";
import { dataMode } from "@/lib/config";
import { toUser } from "@/lib/core/types";
import { deps } from "@/lib/deps";
import { getActor, safeNext } from "@/lib/server/session";

export const metadata: Metadata = { title: "Masuk" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const next = safeNext((await searchParams).lanjut);
  const actor = await getActor();
  if (actor) redirect(actor.user.wajib_ganti_password ? "/ganti-password" : (next ?? "/beranda"));

  const quickUsers = quickLoginAllowed() ? quickLoginUsers(((await deps().store.read("inti", ["Pengguna"])).Pengguna ?? []).map(toUser)) : null;
  const loginForm = (
    <ActionForm action={masuk} className="stack">
      {next ? <input type="hidden" name="lanjut" value={next} /> : null}
      <Field label="Username" name="username" autoComplete="username" placeholder="mis. gan-0001" required autoFocus={!quickUsers} />
      <Field
        label="Password atau PIN"
        name="password"
        type="password"
        autoComplete="current-password"
        hint="Siswa: username = kode siswa (gan-0001). Masuk pertama kali? Kosongkan PIN lalu tekan Masuk untuk membuat PIN."
      />
      <SubmitButton block pendingLabel="Memeriksa…">
        Masuk
      </SubmitButton>
    </ActionForm>
  );

  return (
    <div className="welcome">
      <section className="welcome-story">
        <Wordmark />
        <div className="stack">
          <span className="eyebrow">Ruang kerja bimbel</span>
          <h1>
            Belajar, presensi, dan keuangan dalam <em>satu ruang</em>.
          </h1>
          <p>Untuk owner, admin, pengajar, siswa, dan wali Garda Abdi Negara. Setiap akun hanya melihat bagian yang menjadi haknya.</p>
          <div className="welcome-tags">
            <span>TNI</span>
            <span>Polri</span>
            <span>Kedinasan</span>
          </div>
        </div>
        <div className="welcome-foot">
          <span>GARDA ABDI NEGARA</span>
          <span>RUANG GARDA</span>
        </div>
      </section>
      <section className="welcome-access">
        <div className="welcome-top">
          <ThemeToggle />
          <AppInstallButton />
        </div>
        <div className="welcome-access-inner">
          <div className="stack">
            <span className="eyebrow">Masuk</span>
            <h2>Selamat datang kembali</h2>
            <p className="muted">
              {quickUsers ? "Mode uji coba: pilih akun di bawah untuk masuk tanpa password." : "Siswa masuk dengan kode siswa dan PIN. Admin masuk dengan username dan password."}
            </p>
          </div>
          {dataMode() === "lokal" ? <p className="notice notice-warning">Mode lokal: memakai data contoh di komputer ini.</p> : null}
          {quickUsers ? (
            <section className="quick-login" aria-labelledby="masuk-cepat">
              <div>
                <h3 id="masuk-cepat">Masuk cepat</h3>
                <p className="muted">Hanya muncul saat uji coba dengan npm run dev dan data contoh. Tidak tersedia di versi produksi.</p>
              </div>
              {quickUsers.length === 0 ? (
                <p className="muted">Belum ada akun. Jalankan npm run dev:contoh -- --ulang.</p>
              ) : (
                <div className="quick-login-list">
                  {quickUsers.map((user) => (
                    <form action={masukCepat} key={user.user_id}>
                      <input type="hidden" name="user_id" value={user.user_id} />
                      {next ? <input type="hidden" name="lanjut" value={next} /> : null}
                      <button type="submit" className="quick-login-btn">
                        <span className="quick-login-name">
                          <b>{user.nama}</b>
                          <span className="cell-sub mono">{user.username}</span>
                        </span>
                        <RoleBadge role={user.peran} />
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {quickUsers ? (
            <details className="quick-login-password">
              <summary>Masuk dengan username dan password</summary>
              {loginForm}
            </details>
          ) : (
            <>
              {loginForm}
              <p className="muted">Lupa PIN? Lapor ke admin untuk direset, lalu buat PIN baru saat masuk.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

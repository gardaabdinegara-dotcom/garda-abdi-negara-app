import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { buatAkun } from "@/app/actions/akun";
import { AkunDaftar, CetakKartuLogin, type AkunRingkas } from "@/components/akun-daftar";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { PageHead } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import { canManageAccount, canSetFinanceAccess } from "@/lib/core/permissions";
import { FINANCE_ACCESS, FINANCE_ACCESS_LABEL, ROLE_LABEL, ROLES } from "@/lib/core/types";
import { loadAccounts } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Akun pengguna" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const params = await searchParams;
  const accounts = await loadAccounts(actor);
  const saring = params.pin === "belum" ? "pin-belum" : typeof params.peran === "string" && (ROLES as readonly string[]).includes(params.peran) ? params.peran : "semua";
  // Status PIN: akun siswa tanpa hash = belum membuat PIN (sama dengan aturan masuk pertama di lib/core/pin.ts).
  const rows: AkunRingkas[] = accounts.map((a) => ({
    user_id: a.user_id,
    nama: a.nama,
    username: a.username,
    peran: a.peran,
    peranLabel: ROLE_LABEL[a.peran],
    aktif: a.aktif,
    pin: a.peran === "SISWA" ? (a.punya_kredensial ? "aktif" : "belum") : null,
    sementara: a.peran !== "SISWA" && a.wajib_ganti_password,
    siswa_id: a.peran === "SISWA" ? (a.links.find((l) => l.jenis === "SISWA")?.siswa_id ?? "") : "",
    manageable: a.manageable,
  }));
  const siswaAktif = rows.filter((a) => a.peran === "SISWA" && a.aktif);
  const bisaCetak = canManageAccount(actor, "SISWA");
  const creatable = ROLES.filter((role) => (FITUR.peranTambahan || role === "OWNER") && canManageAccount(actor, role));
  const owner = canSetFinanceAccess(actor);

  return (
    <div className="page">
      <PageHead
        eyebrow="Pengaturan"
        title="Akun pengguna"
        actions={
          <>
            {!FITUR.peranTambahan && creatable.length > 0 ? (
              <Link href="#buat-akun" className="btn btn-secondary only-mobile">
                Tambah Owner
              </Link>
            ) : null}
            {bisaCetak ? <CetakKartuLogin belum={siswaAktif.filter((a) => a.pin === "belum").length} semua={siswaAktif.length} /> : null}
          </>
        }
        description={
          !FITUR.peranTambahan
            ? "Akun Owner dan akun siswa. Reset PIN siswa yang lupa dari sini."
            : owner
              ? "Owner mengelola semua akun dan menentukan akses keuangan admin."
              : "Admin mengelola akun pengajar, siswa, dan wali."
        }
      />
      <SettingsTabs current="akun" owner={owner} />
      <div className="grid-main">
        <section className="card dr-card">
          <div className="card-head">
            <div>
              <h2>Daftar akun</h2>
              <p>Ketuk akun siswa untuk Reset PIN atau membuka profilnya. Akun lain dibuka di halaman detail.</p>
            </div>
          </div>
          <AkunDaftar accounts={rows} initialSaring={saring} />
        </section>

        <div className="stack">
          {creatable.length > 0 ? (
            <section className="card" id="buat-akun">
              <div className="card-head">
                <div>
                  <h2>{FITUR.peranTambahan ? "Buat akun" : "Buat akun Owner"}</h2>
                  <p>
                    {FITUR.peranTambahan ? null : "Owner memiliki akses penuh sebagai superadmin. "}
                    Password sementara dibuat otomatis dan hanya ditampilkan sekali.
                  </p>
                </div>
              </div>
              <ActionForm action={buatAkun} operationId={randomUUID()} resetOnSuccess className="stack">
                <Field label="Nama" name="nama" required autoComplete="off" />
                <Field
                  label="Username"
                  name="username"
                  required
                  autoComplete="off"
                  placeholder="mis. budi.santoso"
                  hint="Huruf kecil, angka, titik, garis bawah, atau tanda hubung. Tidak bisa diubah."
                />
                {FITUR.peranTambahan ? (
                  <Field
                    label="Peran"
                    name="peran"
                    type="select"
                    defaultValue={creatable.includes("SISWA") ? "SISWA" : creatable[0]}
                    options={creatable.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
                  />
                ) : (
                  <input type="hidden" name="peran" value="OWNER" />
                )}
                {FITUR.peranTambahan && owner ? (
                  <Field
                    label="Akses keuangan"
                    name="akses_keuangan"
                    type="select"
                    defaultValue="TIDAK"
                    options={FINANCE_ACCESS.map((v) => ({ value: v, label: FINANCE_ACCESS_LABEL[v] }))}
                    hint="Hanya berlaku untuk peran Admin."
                  />
                ) : null}
                <div className="form-actions">
                  <SubmitButton pendingLabel="Membuat…">{FITUR.peranTambahan ? "Buat akun" : "Buat akun Owner"}</SubmitButton>
                </div>
              </ActionForm>
            </section>
          ) : null}
          {!FITUR.peranTambahan ? (
            <section className="card">
              <div className="card-head">
                <h2>Akun siswa dibuat otomatis</h2>
              </div>
              <ol className="guide-steps">
                <li>
                  Tambah atau impor siswa dari menu <Link href="/siswa">Siswa</Link>. Akunnya langsung dibuat dengan username = kode siswa (mis. <span className="mono">gan-0001</span>).
                </li>
                <li>Saat masuk pertama, siswa mengisi kode siswa, mengosongkan PIN, lalu membuat PIN 6 angka.</li>
                <li>Siswa lupa PIN? Buka akunnya di daftar ini, lalu tekan Reset PIN.</li>
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

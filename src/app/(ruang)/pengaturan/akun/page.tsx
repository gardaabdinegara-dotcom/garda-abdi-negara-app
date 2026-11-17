import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { buatAkun } from "@/app/actions/akun";
import { ActionForm, Field, SubmitButton } from "@/components/form";
import { ActiveBadge, Badge, Empty, PageHead, RoleBadge } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import { canManageAccount, canSetFinanceAccess } from "@/lib/core/permissions";
import { FINANCE_ACCESS, FINANCE_ACCESS_LABEL, ROLE_LABEL, ROLES, type Role } from "@/lib/core/types";
import { loadAccounts } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";
import { SettingsTabs } from "../tabs";

export const metadata: Metadata = { title: "Akun pengguna" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AccountsPage({ searchParams }: { searchParams: Search }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const params = await searchParams;
  const filter = typeof params.peran === "string" && (ROLES as readonly string[]).includes(params.peran) ? (params.peran as Role) : null;
  const accounts = await loadAccounts(actor);
  const shown = filter ? accounts.filter((a) => a.peran === filter) : accounts;
  const creatable = ROLES.filter((role) => canManageAccount(actor, role));
  const owner = canSetFinanceAccess(actor);

  return (
    <div className="page">
      <PageHead
        eyebrow="Pengaturan"
        title="Akun pengguna"
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
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Daftar akun</h2>
              <p>Pilih akun untuk mengubah data, membuat password sementara, atau menautkan siswa/kelas.</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Saring peran">
            <Link href="/pengaturan/akun" className="tab" aria-current={filter ? undefined : "page"}>
              Semua ({accounts.length})
            </Link>
            {ROLES.map((role) => {
              const count = accounts.filter((a) => a.peran === role).length;
              if (count === 0) return null;
              return (
                <Link key={role} href={`/pengaturan/akun?peran=${role}`} className="tab" aria-current={filter === role ? "page" : undefined}>
                  {ROLE_LABEL[role]} ({count})
                </Link>
              );
            })}
          </nav>
          {shown.length === 0 ? (
            <Empty title="Belum ada akun" />
          ) : (
            <div className="table-wrap">
              <table className="data responsive">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Peran</th>
                    <th>Tautan</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.user_id}>
                      <td data-label="">
                        <Link href={`/pengaturan/akun/${a.user_id}`} className="cell-title">
                          {a.nama}
                        </Link>
                        <span className="cell-sub mono">@{a.username}</span>
                      </td>
                      <td data-label="Peran">
                        <span className="row">
                          <RoleBadge role={a.peran} />
                          {a.peran === "ADMIN" && a.akses_keuangan !== "TIDAK" ? <Badge tone="warning">Keuangan: {FINANCE_ACCESS_LABEL[a.akses_keuangan]}</Badge> : null}
                        </span>
                      </td>
                      <td data-label="Tautan">{a.links.length || "-"}</td>
                      <td data-label="Status">
                        <span className="row">
                          <ActiveBadge active={a.aktif} />
                          {a.aktif && a.wajib_ganti_password ? <Badge tone="warning">Password sementara</Badge> : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!FITUR.peranTambahan ? (
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Akun siswa dibuat otomatis</h2>
                <p>Ruang Garda kini hanya untuk Owner dan Siswa.</p>
              </div>
            </div>
            <ol className="guide-steps">
              <li>
                Tambah atau impor siswa dari menu <Link href="/siswa">Siswa</Link>. Akunnya langsung dibuat dengan username = kode siswa (mis. <span className="mono">gan-0001</span>).
              </li>
              <li>Saat masuk pertama, siswa mengisi kode siswa, mengosongkan PIN, lalu membuat PIN 6 angka.</li>
              <li>Siswa lupa PIN? Buka akunnya di daftar ini, lalu tekan Reset PIN.</li>
            </ol>
          </section>
        ) : (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Buat akun</h2>
              <p>Password sementara dibuat otomatis dan hanya ditampilkan sekali.</p>
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
            <Field
              label="Peran"
              name="peran"
              type="select"
              defaultValue={creatable.includes("SISWA") ? "SISWA" : creatable[0]}
              options={creatable.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
            />
            {owner ? (
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
              <SubmitButton pendingLabel="Membuat…">Buat akun</SubmitButton>
            </div>
          </ActionForm>
        </section>
        )}
      </div>
    </div>
  );
}

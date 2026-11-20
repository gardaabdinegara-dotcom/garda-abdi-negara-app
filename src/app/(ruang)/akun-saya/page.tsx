import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { cabutSesi } from "@/app/actions/akun";
import { keluar } from "@/app/actions/auth";
import { kembaliDariUjiSiswa } from "@/app/actions/uji-siswa";
import { ActionForm, SubmitButton } from "@/components/form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge, Empty, PageHead, RoleBadge } from "@/components/ui";
import { financeAccess } from "@/lib/core/permissions";
import { FINANCE_ACCESS_LABEL } from "@/lib/core/types";
import { loadOverview } from "@/lib/server/queries";
import { getUjiSiswa, requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Akun saya" };

export default async function MyAccountPage() {
  const actor = await requireActor();
  const test = await getUjiSiswa();
  const overview = await loadOverview(actor);
  const { user } = actor;
  const role = user.peran;
  const showFinance = role === "OWNER" || role === "ADMIN";

  return (
    <div className="page">
      <PageHead eyebrow="Akun saya" title={user.nama} actions={<RoleBadge role={role} />} />
      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Profil</h2>
            </div>
            <dl className="facts">
              <dt>Username</dt>
              <dd className="mono">{user.username}</dd>
              <dt>Nama</dt>
              <dd>{user.nama}</dd>
              {showFinance ? (
                <>
                  <dt>Akses keuangan</dt>
                  <dd>{FINANCE_ACCESS_LABEL[financeAccess(actor)]}</dd>
                </>
              ) : null}
            </dl>
            <p className="muted">{role === "OWNER" || role === "ADMIN" ? "Ubah nama atau username di Pengaturan → Akun." : "Nama dan username diubah oleh owner."}</p>
          </section>

          {role === "SISWA" || role === "WALI" ? (
            <section className="card">
              <div className="card-head">
                <h2>{role === "WALI" ? "Anak yang ditautkan" : "Data siswa"}</h2>
              </div>
              {overview.myStudents.length === 0 ? (
                <Empty title="Belum tertaut">Minta admin menautkan data siswa ke akun Anda.</Empty>
              ) : (
                <div className="item-list">
                  {overview.myStudents.map((s) => (
                    <div className="item" key={s.siswa_id}>
                      <div className="item-main">
                        <Link href={`/siswa/${s.siswa_id}`} className="cell-title">
                          {s.nama}
                        </Link>
                        <span className="cell-sub mono">{s.kode_siswa}</span>
                      </div>
                      {s.jalur_target ? <Badge tone="info">{s.jalur_target}</Badge> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {role === "PENGAJAR" ? (
            <section className="card">
              <div className="card-head">
                <h2>Kelas yang diajar</h2>
              </div>
              {overview.myClasses.length === 0 ? (
                <Empty title="Belum ada kelas" />
              ) : (
                <div className="item-list">
                  {overview.myClasses.map((c) => (
                    <div className="item" key={c.kelas_id}>
                      <b>{c.nama_kelas}</b>
                      <Badge tone="info">{c.students} siswa aktif</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Keamanan</h2>
                <p>{role === "SISWA" ? "Ganti PIN secara berkala dan jangan beri tahu siapa pun." : "Ganti password secara berkala dan jangan bagikan ke orang lain."}</p>
              </div>
            </div>
            <div className="row">
              <Link href="/ganti-password" className="btn btn-secondary">
                {role === "SISWA" ? "Ganti PIN" : "Ganti password"}
              </Link>
              <Link href="/panduan" className="btn btn-ghost">
                Panduan singkat
              </Link>
            </div>
            <ActionForm action={cabutSesi} operationId={randomUUID()} confirm="Keluar dari semua perangkat, termasuk perangkat ini?">
              <input type="hidden" name="user_id" value={user.user_id} />
              <SubmitButton variant="danger" pendingLabel="Memproses…">
                Keluar dari semua perangkat
              </SubmitButton>
            </ActionForm>
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Tampilan</h2>
                <p>Pilihan tersimpan di perangkat ini.</p>
              </div>
            </div>
            <div className="row">
              <ThemeToggle withLabel />
            </div>
          </section>
          <form action={test?.status === "aktif" ? kembaliDariUjiSiswa.bind(null, test.id) : keluar}>
            <button type="submit" className="btn btn-secondary btn-block">
              Keluar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

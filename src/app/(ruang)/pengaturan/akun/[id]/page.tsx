import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { buatPasswordSementara, cabutSesi, hapusAkun, lepasTautan, resetPinSiswa, tambahTautan, ubahAkun } from "@/app/actions/akun";
import { ActionForm, CheckField, Field, SubmitButton } from "@/components/form";
import { ActiveBadge, Badge, Empty, Notice, PageHead, RoleBadge } from "@/components/ui";
import { canManageAccount, canSetFinanceAccess } from "@/lib/core/permissions";
import { FINANCE_ACCESS, FINANCE_ACCESS_LABEL, ROLE_LABEL, ROLES } from "@/lib/core/types";
import { loadAccount, loadCatalog, loadStudents } from "@/lib/server/queries";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Detail akun" };

type Params = Promise<{ id: string }>;

export default async function AccountPage({ params }: { params: Params }) {
  const actor = await requireActor({ roles: ["OWNER", "ADMIN"] });
  const { id } = await params;
  const [account, students, catalog] = await Promise.all([loadAccount(actor, decodeURIComponent(id)), loadStudents(actor), loadCatalog()]);
  const self = account.user_id === actor.user.user_id;
  const owner = canSetFinanceAccess(actor);
  const roles = ROLES.filter((role) => canManageAccount(actor, role));
  const studentById = new Map(students.map((s) => [s.siswa_id, s]));
  const classById = new Map(catalog.classes.map((c) => [c.kelas_id, c]));
  const programName = new Map(catalog.programs.map((p) => [p.program_id, p.nama_program]));
  const linkKind = account.peran === "SISWA" ? "SISWA" : account.peran === "WALI" ? "WALI" : account.peran === "PENGAJAR" ? "PENGAJAR_KELAS" : null;
  const linkedStudents = new Set(account.links.map((l) => l.siswa_id));
  const linkedClasses = new Set(account.links.map((l) => l.kelas_id));
  const studentOptions = students.filter((s) => s.aktif && !linkedStudents.has(s.siswa_id)).map((s) => ({ value: s.siswa_id, label: `${s.nama} (${s.kode_siswa})` }));
  const classOptions = catalog.classes
    .filter((c) => c.aktif && !linkedClasses.has(c.kelas_id))
    .map((c) => ({ value: c.kelas_id, label: `${c.nama_kelas} · ${programName.get(c.program_id) ?? "?"}` }));
  const canAddLink = linkKind !== null && !(linkKind === "SISWA" && account.links.length > 0);

  return (
    <div className="page">
      <PageHead
        back={{ href: "/pengaturan/akun", label: "Akun pengguna" }}
        eyebrow={`@${account.username}`}
        title={account.nama}
        actions={
          <>
            <RoleBadge role={account.peran} />
            <ActiveBadge active={account.aktif} />
          </>
        }
      />
      {account.aktif && account.wajib_ganti_password ? <Notice tone="warning">Akun ini belum mengganti password sementara.</Notice> : null}
      {!account.manageable ? <Notice>Akun {ROLE_LABEL[account.peran]} hanya dapat diubah oleh owner.</Notice> : null}

      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div>
                <h2>Data akun</h2>
                <p>Mengubah peran, status, atau akses keuangan membuat akun ini harus masuk ulang.</p>
              </div>
            </div>
            {account.manageable ? (
              <ActionForm action={ubahAkun} operationId={randomUUID()} className="stack">
                <input type="hidden" name="user_id" value={account.user_id} />
                <div className="form-grid two">
                  <Field label="Nama" name="nama" defaultValue={account.nama} required />
                  <Field
                    label="Peran"
                    name="peran"
                    type="select"
                    defaultValue={account.peran}
                    options={roles.map((role) => ({ value: role, label: ROLE_LABEL[role] }))}
                    disabled={self}
                    hint={self ? "Peran akun sendiri tidak dapat diubah." : undefined}
                  />
                  {owner && !self ? (
                    <Field
                      label="Akses keuangan"
                      name="akses_keuangan"
                      type="select"
                      defaultValue={account.akses_keuangan}
                      options={FINANCE_ACCESS.map((v) => ({ value: v, label: FINANCE_ACCESS_LABEL[v] }))}
                      hint="Hanya berlaku untuk peran Admin. Lihat = membaca laporan; Catat = juga mencatat transaksi."
                    />
                  ) : null}
                </div>
                {self ? (
                  <>
                    <input type="hidden" name="peran" value={account.peran} />
                    <input type="hidden" name="aktif" value="true" />
                  </>
                ) : (
                  <CheckField label="Akun aktif" name="aktif" defaultChecked={account.aktif} hint="Akun nonaktif tidak bisa masuk; datanya tetap tersimpan." />
                )}
                <div className="form-actions">
                  <SubmitButton>Simpan akun</SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <dl className="facts">
                <dt>Username</dt>
                <dd className="mono">{account.username}</dd>
                <dt>Peran</dt>
                <dd>{ROLE_LABEL[account.peran]}</dd>
              </dl>
            )}
          </section>

          {linkKind ? (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>{linkKind === "PENGAJAR_KELAS" ? "Kelas yang diajar" : linkKind === "WALI" ? "Anak yang ditautkan" : "Data siswa"}</h2>
                  <p>
                    {linkKind === "PENGAJAR_KELAS"
                      ? "Pengajar hanya melihat siswa aktif di kelas yang ditautkan."
                      : linkKind === "WALI"
                        ? "Wali dapat ditautkan ke lebih dari satu anak."
                        : "Akun siswa ditautkan ke tepat satu data siswa."}
                  </p>
                </div>
              </div>
              {account.links.length === 0 ? (
                <Empty title="Belum ada tautan" />
              ) : (
                <div className="item-list">
                  {account.links.map((link) => {
                    const student = studentById.get(link.siswa_id);
                    const kelas = classById.get(link.kelas_id);
                    return (
                      <div className="item" key={link.tautan_id}>
                        <div className="item-main">
                          {link.jenis === "PENGAJAR_KELAS" ? (
                            <>
                              <b>{kelas?.nama_kelas ?? "Kelas tidak dikenal"}</b>
                              <span className="cell-sub">{kelas ? programName.get(kelas.program_id) : ""}</span>
                            </>
                          ) : (
                            <>
                              <Link href={`/siswa/${link.siswa_id}`} className="cell-title">
                                {student?.nama ?? "Siswa tidak dikenal"}
                              </Link>
                              <span className="cell-sub mono">{student?.kode_siswa}</span>
                            </>
                          )}
                        </div>
                        {account.manageable ? (
                          <ActionForm action={lepasTautan} operationId={randomUUID()} confirm="Lepas tautan ini?" feedback={false}>
                            <input type="hidden" name="tautan_id" value={link.tautan_id} />
                            <SubmitButton variant="ghost" size="sm" pendingLabel="Melepas…">
                              Lepas
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
              {account.manageable && canAddLink ? (
                <ActionForm action={tambahTautan} operationId={randomUUID()} className="stack">
                  <input type="hidden" name="user_id" value={account.user_id} />
                  <input type="hidden" name="jenis" value={linkKind} />
                  {linkKind === "PENGAJAR_KELAS" ? (
                    classOptions.length === 0 ? (
                      <Notice>Semua kelas aktif sudah ditautkan.</Notice>
                    ) : (
                      <Field label="Tambah kelas" name="kelas_id" type="select" options={classOptions} />
                    )
                  ) : studentOptions.length === 0 ? (
                    <Notice>Tidak ada siswa aktif yang bisa ditautkan.</Notice>
                  ) : (
                    <Field label="Tautkan siswa" name="siswa_id" type="select" options={studentOptions} />
                  )}
                  {(linkKind === "PENGAJAR_KELAS" ? classOptions : studentOptions).length > 0 ? (
                    <div className="form-actions">
                      <SubmitButton>Tautkan</SubmitButton>
                    </div>
                  ) : null}
                </ActionForm>
              ) : null}
            </section>
          ) : null}
        </div>

        {account.manageable ? (
          <div className="stack">
            {account.peran === "SISWA" ? (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>PIN siswa</h2>
                    <p>
                      Siswa masuk dengan username <b className="mono">{account.username}</b> dan PIN 6 angka yang dibuatnya sendiri.
                    </p>
                  </div>
                  {account.punya_kredensial ? <Badge tone="success">PIN aktif</Badge> : <Badge tone="warning">Belum membuat PIN</Badge>}
                </div>
                {account.punya_kredensial ? (
                  <ActionForm action={resetPinSiswa} operationId={randomUUID()} confirm={`Reset PIN ${account.username}? PIN lama langsung tidak berlaku.`}>
                    <input type="hidden" name="user_id" value={account.user_id} />
                    <p className="muted">Bila siswa lupa PIN: tekan Reset PIN, lalu minta siswa masuk dengan usernamenya saja (PIN dikosongkan) untuk membuat PIN baru.</p>
                    <SubmitButton variant="secondary" pendingLabel="Mereset…">
                      Reset PIN
                    </SubmitButton>
                  </ActionForm>
                ) : (
                  <p className="muted">Siswa membuka halaman masuk, mengisi username {account.username}, mengosongkan PIN, lalu menekan Masuk untuk membuat PIN.</p>
                )}
              </section>
            ) : (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Password sementara</h2>
                    <p>Untuk akun yang lupa password. Password lama langsung tidak berlaku dan semua sesinya berakhir.</p>
                  </div>
                </div>
                <ActionForm action={buatPasswordSementara} operationId={randomUUID()} confirm={`Buat password sementara baru untuk ${account.username}?`}>
                  <input type="hidden" name="user_id" value={account.user_id} />
                  <SubmitButton variant="secondary" pendingLabel="Membuat…">
                    Buat password sementara
                  </SubmitButton>
                </ActionForm>
              </section>
            )}
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>Sesi</h2>
                  <p>Keluarkan akun ini dari semua perangkat, mis. bila ponselnya hilang.</p>
                </div>
              </div>
              <ActionForm action={cabutSesi} operationId={randomUUID()} confirm={`Keluarkan ${account.username} dari semua perangkat?`}>
                <input type="hidden" name="user_id" value={account.user_id} />
                <SubmitButton variant="danger" pendingLabel="Memproses…">
                  Keluarkan dari semua perangkat
                </SubmitButton>
              </ActionForm>
            </section>
            {!self ? (
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Hapus akun</h2>
                    <p>{account.peran === "SISWA" ? "Akun login siswa ini dihapus; data siswanya tetap ada dan akun baru bisa dibuat lagi. Untuk menghapus siswanya sekalian, pakai Hapus siswa di profil siswa." : "Akun ini tidak bisa dipakai masuk lagi dan hilang dari daftar."}</p>
                  </div>
                </div>
                <ActionForm action={hapusAkun} operationId={randomUUID()} confirm={`Hapus akun ${account.username}?`}>
                  <input type="hidden" name="user_id" value={account.user_id} />
                  <SubmitButton variant="danger" pendingLabel="Menghapus…">
                    Hapus akun
                  </SubmitButton>
                </ActionForm>
              </section>
            ) : null}
            {account.peran === "ADMIN" ? (
              <section className="card">
                <div className="card-head">
                  <h2>Akses keuangan</h2>
                  <Badge tone={account.akses_keuangan === "TIDAK" ? "neutral" : "warning"}>{FINANCE_ACCESS_LABEL[account.akses_keuangan]}</Badge>
                </div>
                <p className="muted">Admin dengan akses keuangan bisa melihat atau mencatat transaksi sesuai tingkat aksesnya.</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

"use client";

// Daftar akun ringkas (Pengaturan → Akun): satu baris per akun dengan status PIN, saring "PIN belum dibuat",
// dan baris akun siswa yang bisa dibuka untuk Reset PIN tanpa pindah halaman. Juga tombol "Cetak kartu login".
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { resetPinSiswa } from "@/app/actions/akun";
import type { ActionState } from "@/lib/action-state";
import { cocokAkun, type AkunCari, type SaringAkun } from "@/lib/core/saring-daftar";
import { initials } from "@/lib/format";
import { ActionForm, SubmitButton } from "./form";
import { Icon } from "./icon";
import { Lembar } from "./lembar";
import "./daftar-ringkas.css";

export interface AkunRingkas extends AkunCari {
  user_id: string;
  peranLabel: string;
  aktif: boolean;
  /** Akun Owner/Admin yang masih memakai password sementara. */
  sementara: boolean;
  /** Siswa yang ditautkan (akun siswa), untuk tautan "Buka profil". */
  siswa_id: string;
  manageable: boolean;
}

function Status({ a }: { a: AkunRingkas }) {
  if (!a.aktif) return <span className="badge badge-danger">Nonaktif</span>;
  if (a.pin === "aktif") return <span className="badge badge-success">PIN aktif</span>;
  if (a.pin === "belum") return <span className="badge badge-warning">PIN belum dibuat</span>;
  if (a.sementara) return <span className="badge badge-warning">Password sementara</span>;
  return <span className="badge">Password</span>;
}

function ResetPin({ a, onDone }: { a: AkunRingkas; onDone: (pesan: string) => void }) {
  // Dibuat saat baris dibuka (selalu di klien), jadi tidak ada beda isi antara server dan klien.
  const [operationId] = useState(() => crypto.randomUUID());
  const action = useCallback(
    async (prev: ActionState, data: FormData) => {
      const result = await resetPinSiswa(prev, data);
      if (result.ok) onDone(result.message);
      return result;
    },
    [onDone],
  );
  return (
    <ActionForm action={action} operationId={operationId} confirm={`Reset PIN ${a.username}? PIN lama langsung tidak berlaku.`}>
      <input type="hidden" name="user_id" value={a.user_id} />
      <SubmitButton size="sm" pendingLabel="Mereset…">
        Reset PIN
      </SubmitButton>
    </ActionForm>
  );
}

export function AkunDaftar({ accounts, initialSaring }: { accounts: AkunRingkas[]; initialSaring: SaringAkun }) {
  const [q, setQ] = useState("");
  const [saring, setSaring] = useState<SaringAkun>(initialSaring);
  const [buka, setBuka] = useState<string | null>(null);
  // Pesan hasil Reset PIN tetap tampil walau tombolnya hilang (status berganti menjadi "PIN belum dibuat").
  const [pesan, setPesan] = useState<{ id: string; text: string } | null>(null);

  const chips = useMemo(() => {
    const roles: { key: string; label: string }[] = [];
    for (const a of accounts) if (!roles.some((r) => r.key === a.peran)) roles.push({ key: a.peran, label: a.peranLabel });
    const list = [{ key: "semua", label: "Semua" }, ...roles];
    if (accounts.some((a) => a.pin !== null)) list.push({ key: "pin-belum", label: "PIN belum dibuat" });
    return list.map((c) => ({ ...c, count: accounts.filter((a) => cocokAkun(a, q, c.key)).length }));
  }, [accounts, q]);
  const shown = accounts.filter((a) => cocokAkun(a, q, saring));

  return (
    <>
      <div className="dr-cari" role="search">
        <label htmlFor="cari-akun" className="sr-only">
          Cari akun
        </label>
        <Icon name="search" />
        <input id="cari-akun" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau username" autoComplete="off" enterKeyHint="search" />
      </div>
      <div className="dr-chips" role="group" aria-label="Saring akun">
        {chips.map((c) => (
          <a
            key={c.key}
            href={c.key === "semua" ? "/pengaturan/akun" : c.key === "pin-belum" ? "/pengaturan/akun?pin=belum" : `/pengaturan/akun?peran=${c.key}`}
            className={`dr-chip${saring === c.key ? " is-on" : ""}${c.key === "pin-belum" ? " is-oranye" : ""}`}
            aria-pressed={saring === c.key}
            onClick={(e) => {
              e.preventDefault();
              setSaring(c.key);
              try {
                window.history.replaceState(window.history.state, "", e.currentTarget.getAttribute("href") ?? "/pengaturan/akun");
              } catch {
                /* abaikan */
              }
            }}
          >
            {c.label} <em>{c.count}</em>
          </a>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="dr-empty">
          <b>{saring === "pin-belum" && !q ? "Semua siswa sudah membuat PIN" : "Tidak ada yang cocok"}</b>
          {saring === "pin-belum" && !q ? "Tidak ada akun siswa yang menunggu PIN." : "Ubah kata kunci atau pilih chip lain."}
        </div>
      ) : (
        <ul className="dr-list">
          {shown.map((a) => {
            const open = buka === a.user_id;
            const head = (
              <>
                <span className={`dr-av${a.peran === "OWNER" || a.peran === "ADMIN" ? " is-owner" : ""}`} aria-hidden="true">
                  {initials(a.nama)}
                </span>
                <span className="dr-nm">
                  <b>
                    <span className="dr-nama">{a.nama}</span>
                  </b>
                  <small>
                    <code>@{a.username}</code> · {a.peranLabel}
                  </small>
                </span>
                <Status a={a} />
              </>
            );
            // Baris akun siswa dibuka di tempat; akun lain langsung ke halaman detail.
            const expandable = a.pin !== null && a.manageable;
            return (
              <li key={a.user_id} className={`dr-row${open ? " is-buka" : ""}${a.aktif ? "" : " is-mati"}`}>
                {expandable ? (
                  <button type="button" className="dr-main" aria-expanded={open} aria-controls={`akun-${a.user_id}`} onClick={() => setBuka(open ? null : a.user_id)}>
                    {head}
                    <Icon name="back" className="icon dr-chev" />
                  </button>
                ) : (
                  <Link href={`/pengaturan/akun/${encodeURIComponent(a.user_id)}`} className="dr-main">
                    {head}
                  </Link>
                )}
                {expandable && open ? (
                  <div className="dr-buka" id={`akun-${a.user_id}`}>
                    <div className="dr-buka-aksi">
                      {a.pin === "aktif" && a.aktif ? <ResetPin a={a} onDone={(text) => setPesan({ id: a.user_id, text })} /> : null}
                      {a.siswa_id ? (
                        <Link href={`/siswa/${encodeURIComponent(a.siswa_id)}`} className="btn btn-secondary btn-sm">
                          Buka profil
                        </Link>
                      ) : null}
                      <Link href={`/pengaturan/akun/${encodeURIComponent(a.user_id)}`} className="btn btn-secondary btn-sm">
                        Ubah akun
                      </Link>
                    </div>
                    {pesan?.id === a.user_id ? (
                      <p className="notice notice-success" role="status">
                        {pesan.text}
                      </p>
                    ) : null}
                    <p>
                      {!a.aktif
                        ? "Akun nonaktif tidak bisa masuk. Aktifkan lagi dari halaman Ubah akun."
                        : a.pin === "aktif"
                          ? "Reset PIN: PIN lama langsung tidak berlaku. Siswa masuk dengan username saja, lalu membuat PIN baru."
                          : "Siswa belum membuat PIN. Ia masuk dengan username saja (PIN dikosongkan), lalu membuat PIN 6 angka."}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const lembarA4 = (n: number) => Math.ceil(n / 8);

/** Tombol "Cetak kartu login" dan lembar pilihannya. Pratinjau cetak dibuka di /cetak/kartu-login. */
export function CetakKartuLogin({ belum, semua }: { belum: number; semua: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" aria-haspopup="dialog" onClick={() => setOpen(true)} disabled={semua === 0}>
        <Icon name="print" />
        Cetak kartu login
      </button>
      <Lembar open={open} onClose={() => setOpen(false)} title="Cetak kartu login" sub="Satu kartu per siswa: alamat aplikasi, QR, username, dan 3 langkah masuk. 8 kartu per lembar A4.">
        <form method="get" action="/cetak/kartu-login" className="stack">
          <fieldset className="kl-pilih">
            <legend>Siapa yang dicetak?</legend>
            <label className="kl-opsi">
              <input type="radio" name="siapa" value="belum" defaultChecked={belum > 0} disabled={belum === 0} />
              <span>
                <b>Hanya yang belum membuat PIN</b>
                <small>{belum ? `${belum} siswa · ${lembarA4(belum)} lembar A4` : "Semua siswa sudah membuat PIN"}</small>
              </span>
            </label>
            <label className="kl-opsi">
              <input type="radio" name="siapa" value="semua" defaultChecked={belum === 0} />
              <span>
                <b>Semua siswa</b>
                <small>
                  {semua} siswa · {lembarA4(semua)} lembar A4
                </small>
              </span>
            </label>
          </fieldset>
          <p className="kl-info">
            <Icon name="shield" />
            <span>PIN tidak ikut dicetak. Siswa membuat PIN sendiri saat pertama kali masuk.</span>
          </p>
          <button type="submit" className="btn btn-block">
            Lihat pratinjau &amp; cetak
          </button>
          <p className="kl-catatan">Dari jendela cetak, lembar juga bisa disimpan sebagai PDF.</p>
        </form>
      </Lembar>
    </>
  );
}

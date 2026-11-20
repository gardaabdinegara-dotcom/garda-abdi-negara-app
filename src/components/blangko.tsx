// Satu lembar A4 "Blangko Tes Kesamaptaan Jasmani", mengikuti blangko lembaga (docs/desain/arah-desain/samapta.html).
// Tanpa `isi` → blangko kosong untuk diisi tangan. Gaya ada di src/app/cetak/cetak.css.
import { formatDuration, type SamaptaResult, type SamaptaScore, type SamaptaSettings, type SamaptaTest } from "@/lib/core/samapta";
import type { Student } from "@/lib/core/types";

export interface BlangkoIsi {
  test: SamaptaTest;
  student: Student;
  result: SamaptaResult;
  score: SamaptaScore;
  usia: number | null;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"] as const;
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"] as const;

function dateParts(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d, dd: m[3]!, mm: m[2]!, day: new Date(Date.UTC(y, mo - 1, d)).getUTCDay() };
}

/** 2026-11-15 → 15-11-2026 */
export function tanggalDmy(iso: string): string {
  const p = dateParts(iso);
  return p ? `${p.dd}-${p.mm}-${p.y}` : "";
}

/** 2026-11-15 → Minggu */
export function namaHari(iso: string): string {
  const p = dateParts(iso);
  return p ? HARI[p.day]! : "";
}

/** 2026-11-15 → 15 November 2026 */
export function tanggalPanjang(iso: string): string {
  const p = dateParts(iso);
  return p ? `${p.d} ${BULAN[p.mo - 1]} ${p.y}` : "";
}

/** Angka gaya Indonesia (koma desimal, titik ribuan). Kosong bila tidak ada. */
function angka(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "";
  return value.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

function tempatTanggalLahir(s: Student): string {
  const tanggal = tanggalDmy(s.tanggal_lahir);
  return [s.tempat_lahir.trim(), tanggal].filter(Boolean).join(", ");
}

function tinggiBerat(r: SamaptaResult): string {
  return [r.tinggi_cm !== null ? `${angka(r.tinggi_cm, 1)} Cm` : "", r.berat_kg !== null ? `${angka(r.berat_kg, 1)} Kg` : ""].filter(Boolean).join(" / ");
}

/** Label baris pull up: putra Pull Up, putri Chinning; bila jenis kelamin belum diisi, keduanya. */
function labelPull(isi: BlangkoIsi | null): string {
  if (!isi || !isi.student.jenis_kelamin) return "Pull Up / Chinning";
  return isi.score.pullLabel;
}

/** Isian bertitik. Teks yang sangat panjang dicetak sedikit lebih kecil agar tetap satu baris. */
function Isian({ label, children, className }: { label: string; children?: React.ReactNode; className?: string }) {
  const panjang = typeof children === "string" && children.length > 48;
  const kelas = ["blangko-v", className, panjang ? "blangko-panjang" : ""].filter(Boolean).join(" ");
  return (
    <>
      <span>{label}</span>
      <span>:</span>
      <span className={kelas}>{children}</span>
    </>
  );
}

function KepalaTtd({ materi, kolom2, kolom3 }: { materi: string; kolom2: string; kolom3: string }) {
  return (
    <thead>
      <tr>
        <th rowSpan={2} className="blangko-w30">
          {materi}
        </th>
        <th rowSpan={2}>{kolom2}</th>
        <th rowSpan={2}>{kolom3}</th>
        <th colSpan={2}>TANDA TANGAN</th>
        <th rowSpan={2}>KETERANGAN</th>
      </tr>
      <tr>
        <th>PESERTA</th>
        <th>TESTOR</th>
      </tr>
    </thead>
  );
}

function BarisMateri({ label, a, b, tall }: { label: string; a: string; b: string; tall?: boolean }) {
  return (
    <tr>
      <td className={tall ? "blangko-l blangko-tall" : "blangko-l"}>{label}</td>
      <td className="blangko-n">{a}</td>
      <td className="blangko-n">{b}</td>
      <td />
      <td />
      <td />
    </tr>
  );
}

export function BlangkoSheet({ settings, isi = null }: { settings: SamaptaSettings; isi?: BlangkoIsi | null }) {
  const s = isi?.student;
  const r = isi?.result;
  const sc = isi?.score;
  const t = isi?.test;
  const kota = settings.kota.trim();
  const hari = t && dateParts(t.tanggal) ? `${namaHari(t.tanggal)} / ${tanggalDmy(t.tanggal)}` : "";
  const pukul = t?.jam_mulai ? `${t.jam_mulai.replace(":", ".")} s.d. selesai` : "";
  const tempat = t ? t.tempat || settings.tempat : settings.tempat;
  const tanggalTtd = t ? tanggalPanjang(t.tanggal) : "";
  const renangWaktu = formatDuration(r?.renang_waktu ?? null);
  const renangNilai = angka(sc?.renang ?? null);

  return (
    <article className="blangko">
      <div className="blangko-kepala">
        <img className="blangko-logo" src="/brand/garda-logo-192-v1.webp" alt="" width={192} height={192} />
        <div className="blangko-kop">{settings.kop}</div>
      </div>
      <div className="blangko-judul">BLANGKO TES KESAMAPTAAN JASMANI</div>

      <div className="blangko-sek">
        <b>I.</b>
        <div>
          <h4>Data Diri</h4>
          <div className="blangko-isi">
            <Isian label="Nama">{s?.nama}</Isian>
            <Isian label="Kode Siswa / Jalur">{s ? [s.kode_siswa, s.jalur_target].filter(Boolean).join(" / ") : ""}</Isian>
            <Isian label="Tempat Tanggal Lahir" className="blangko-split">
              <span>{s ? tempatTanggalLahir(s) : ""}</span>
              <span className="blangko-usia">
                Usia : <span className={isi && isi.usia !== null ? "blangko-usia-v" : "blangko-usia-v blangko-kosong"}>{isi?.usia ?? ""}</span> Thn
              </span>
            </Isian>
            <Isian label="Asal Sekolah">{s?.asal_sekolah}</Isian>
          </div>
        </div>
      </div>

      <div className="blangko-sek">
        <b>II.</b>
        <div className="blangko-dua">
          <div>
            <h4>Pelaksanaan</h4>
            <div className="blangko-isi">
              <Isian label="Hari / Tanggal">{hari}</Isian>
              <Isian label="Pukul">{pukul}</Isian>
              <Isian label="Tempat">{tempat}</Isian>
            </div>
          </div>
          <table>
            <tbody>
              <tr>
                <th>TENSI</th>
                <th>I</th>
                <th>II</th>
                <th>III</th>
              </tr>
              <tr>
                <td />
                <td className="blangko-n">{r?.tensi[0]}</td>
                <td className="blangko-n">{r?.tensi[1]}</td>
                <td className="blangko-n">{r?.tensi[2]}</td>
              </tr>
              <tr>
                <th colSpan={4}>RIWAYAT KES 6 BLN TERAKHIR</th>
              </tr>
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td className="blangko-l blangko-riwayat" colSpan={4}>
                    <span className="blangko-clamp">
                      {i + 1}. <b>{r?.riwayat[i]}</b>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="blangko-sek">
        <b>III.</b>
        <div>
          <h4>Perbandingan Tinggi dan Berat Badan</h4>
          <div className="blangko-isi">
            <Isian label="Tinggi / Berat Badan">{r ? tinggiBerat(r) : ""}</Isian>
            <Isian label="Klasifikasi">{sc && sc.imt !== null ? `${sc.imtKlas} (IMT ${angka(sc.imt, 1)})` : ""}</Isian>
          </div>
        </div>
      </div>

      <div className="blangko-sek">
        <b>IV.</b>
        <div>
          <h4>Kesegaran Jasmani &quot;A&quot;</h4>
          <table>
            <KepalaTtd materi="MATERI" kolom2="JARAK" kolom3="NILAI" />
            <tbody>
              <BarisMateri label="Lari 12 Menit" a={r && r.lari_jarak !== null ? `${angka(r.lari_jarak, 0)} m` : ""} b={angka(r?.lari_nilai ?? null)} tall />
            </tbody>
          </table>
        </div>
      </div>

      <div className="blangko-sek">
        <b>V.</b>
        <div>
          <h4>Kesegaran Jasmani &quot;B&quot;</h4>
          <table>
            <KepalaTtd materi="MATERI" kolom2="JUMLAH" kolom3="NILAI" />
            <tbody>
              <BarisMateri label={`1. ${labelPull(isi)}`} a={angka(r?.pull_jumlah ?? null, 0)} b={angka(r?.pull_nilai ?? null)} />
              <BarisMateri label="2. Sit Up" a={angka(r?.situp_jumlah ?? null, 0)} b={angka(r?.situp_nilai ?? null)} />
              <BarisMateri label="3. Push Up" a={angka(r?.pushup_jumlah ?? null, 0)} b={angka(r?.pushup_nilai ?? null)} />
              <BarisMateri label="4. Shuttle Run 6 x 10 M" a={formatDuration(r?.shuttle_waktu ?? null)} b={angka(r?.shuttle_nilai ?? null)} />
              <tr>
                <th colSpan={2} className="blangko-r">
                  Rata - Rata &quot;B&quot;
                </th>
                <td className="blangko-n">{angka(sc?.garjasB ?? null)}</td>
                <td />
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="blangko-sek">
        <b>VI.</b>
        <div>
          <h4>Ketangkasan</h4>
          <table>
            <KepalaTtd materi="RENANG DASAR" kolom2="GAYA" kolom3={renangNilai ? "WAKTU / NILAI" : "WAKTU"} />
            <tbody>
              <BarisMateri label="50 Meter" a={r?.renang_gaya ?? ""} b={renangNilai ? `${renangWaktu} / ${renangNilai}` : renangWaktu} tall />
            </tbody>
          </table>
        </div>
      </div>

      <div className="blangko-sek">
        <b>VII.</b>
        <div>
          <h4>Hasil Akhir</h4>
          <table className="blangko-hasil">
            <thead>
              <tr>
                <th>GARJAS &quot;A&quot;</th>
                <th>GARJAS &quot;B&quot;</th>
                <th>A + B / 2</th>
                <th>KLASIFIKASI</th>
                <th>KETERANGAN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="blangko-n blangko-tall">{angka(sc?.garjasA ?? null)}</td>
                <td className="blangko-n">{angka(sc?.garjasB ?? null)}</td>
                <td className="blangko-n">{angka(sc?.akhir ?? null)}</td>
                <td className="blangko-n">{sc?.klas ?? ""}</td>
                <td className="blangko-ket">
                  <span className="blangko-clamp blangko-clamp-3">{r?.keterangan}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="blangko-ttd">
        <div>
          {kota ? `${kota}, ` : ""}
          {isi && tanggalTtd ? tanggalTtd : "............................ 20...."}
          <br />
          {settings.ttd_jabatan}
          <div className="blangko-ttd-nama">{settings.ttd_nama.trim() || "......................................"}</div>
        </div>
      </div>
    </article>
  );
}

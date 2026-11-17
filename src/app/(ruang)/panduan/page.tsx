import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "@/components/akademik-client";
import { PageHead } from "@/components/ui";
import { FITUR } from "@/lib/core/fitur";
import type { Role } from "@/lib/core/types";
import { requireActor } from "@/lib/server/session";

export const metadata: Metadata = { title: "Panduan" };

interface Section {
  id: string;
  title: string;
  roles: Role[];
  intro?: string;
  steps: React.ReactNode[];
}

const ALL: Role[] = ["OWNER", "ADMIN", "PENGAJAR", "SISWA", "WALI"];

const SECTIONS: Section[] = [
  {
    id: "persiapan",
    title: "Persiapan awal (sekali, oleh owner)",
    roles: ["OWNER"],
    steps: [
      <>
        <Link href="/pengaturan/lembaga">Pengaturan → Lembaga</Link>: periksa nama, kapasitas, toleransi terlambat, pilihan <b>Hadir lewat QR langsung sah</b>, serta kop, tempat, dan penanda tangan blangko Tes Samapta.
      </>,
      <>
        <Link href="/siswa">Siswa</Link>: tambah satu per satu atau impor dari daftar nama. Akun siswa langsung dibuat (username = kode siswa, mis. gan-0001).
      </>,
      <>
        <Link href="/keuangan">Keuangan → Ringkasan</Link>: tekan <b>Siapkan akun & kategori</b>. Akun kas dan bank serta kategori pemasukan/pengeluaran langsung dibuat dan siap masuk laporan. Isi saldo awal kas dan bank di <Link href="/keuangan/master">Akun & periode</Link>.
      </>,
      <>
        Ingin melihat semua fitur berjalan dulu? <Link href="/pengaturan/pratinjau">Pengaturan → Mode pratinjau</Link> memakai data contoh tanpa menyentuh data asli.
      </>,
      <>
        Sekali saja: <Link href="/keuangan/penyesuaian">Penyesuaian laporan</Link> → verifikasi saldo awal neraca, agar laporan berstatus siap diperiksa.
      </>,
    ],
  },
  {
    id: "presensi",
    title: "Presensi",
    roles: ["OWNER", "ADMIN", "PENGAJAR"],
    steps: [
      <>
        <b>Sebelum latihan</b>: <Link href="/akademik">Presensi</Link> → <b>Buat sesi</b>. Pilih peserta <b>Semua siswa aktif</b> (atau satu kelas).
      </>,
      <>
        <b>Saat mulai</b>: buka sesinya → <b>Buka sesi</b>, lalu tampilkan QR. Siswa memindai dan menekan <b>Ajukan hadir</b>. QR berganti otomatis tiap 10 menit, jadi foto QR lama tidak berlaku.
      </>,
      <>
        Tekan <b>Sahkan semua</b> untuk pengajuan yang menunggu (tidak perlu bila QR langsung sah dinyalakan). Siswa tanpa HP dicatat lewat <b>Catat / ubah</b> pada namanya.
      </>,
      <>
        <b>Selesai</b>: <b>Tutup sesi</b>. Siswa yang belum tercatat dihitung alfa. Rekap bulanan bisa diunduh sebagai CSV.
      </>,
    ],
  },
  {
    id: "samapta",
    title: "Tes Samapta",
    roles: ["OWNER", "ADMIN", "PENGAJAR"],
    intro: "Garjas A = nilai lari 12 menit. Garjas B = rata-rata nilai pull up (putra) atau chinning (putri), sit up, push up, dan shuttle run. Hasil akhir = (A + B) / 2. Renang dicatat tanpa nilai.",
    steps: [
      <>
        <Link href="/samapta">Tes Samapta</Link> → <b>Buat sesi tes</b>. Semua siswa aktif otomatis jadi peserta.
      </>,
      <>
        Di lapangan, buka tes → <b>Isi per pos</b>. Pilih pos (tensi, tinggi/berat, lari, pull up, sit up, push up, shuttle, renang), lalu isi tiap siswa. Setiap baris tersimpan sendiri.
      </>,
      <>
        Nilai (0–100) diisi manual dari tabel nilai resmi. IMT, rata-rata B, hasil akhir, dan klasifikasi dihitung otomatis.
      </>,
      <>
        Tab <b>Hasil</b> menampilkan peringkat dan klasifikasi. Cetak blangko A4 per siswa atau semua sekaligus; <b>Cetak blangko kosong</b> untuk diisi tangan.
      </>,
      <>
        Setelah semua lengkap, tekan <b>Tandai selesai</b> agar isian terkunci. Perlu koreksi? <b>Buka lagi</b>.
      </>,
    ],
  },
  {
    id: "keuangan",
    title: "Keuangan: catat manual",
    roles: ["OWNER", "ADMIN"],
    intro: "Pembayaran siswa diurus langsung (tunai atau transfer). Di aplikasi, owner cukup mencatat setiap uang masuk dan keluar; laporan keuangan dibuat otomatis.",
    steps: [
      <>
        <b>Uang masuk</b>: <Link href="/keuangan/transaksi">Keuangan → Pemasukan & pengeluaran</Link> → jenis <b>Pemasukan</b>, kategori mis. <b>Pembayaran bimbel siswa</b>, tulis nama/kode siswa di keterangan.
      </>,
      <>
        <b>Uang keluar</b>: jenis <b>Pengeluaran</b>, pilih kategori (honor, sewa, operasional, ATK, dan lain-lain) agar laba rugi rapi. Pindah uang kas ke bank lewat <b>Transfer antar akun</b>.
      </>,
      <>
        <b>Salah catat</b>: tekan <b>Ubah / hapus</b> pada barisnya. Saldo dan laporan langsung menyesuaikan; jejak perubahannya tetap tersimpan.
      </>,
      <>
        <b>Laporan</b>: <Link href="/keuangan/laporan">Keuangan → Laporan</Link> → pilih periode → buku kas, laba rugi, atau neraca. Unduh PDF atau CSV.
      </>,
    ],
  },
  {
    id: "ubah-data",
    title: "Mengubah dan menghapus data (owner)",
    roles: ["OWNER", "ADMIN"],
    intro: "Owner bisa menambah, mengubah, dan menghapus di semua bagian. Data yang dihapus hilang dari aplikasi, tetapi barisnya tetap ada di spreadsheet (ditandai kolom dihapus_pada) agar riwayat lain tidak rusak.",
    steps: [
      <>
        <b>Siswa</b>: buka profil siswa → ubah nama dan data lain → <b>Simpan perubahan</b>. Nama di akun login ikut berubah. <b>Nonaktifkan siswa</b> menutup akun loginnya sementara; <b>Hapus siswa</b> menghapus siswa beserta akunnya untuk data yang salah input.
      </>,
      <>
        <b>Akun</b>: Pengaturan → Akun → pilih akun → ubah data, <b>Reset PIN</b> bila lupa PIN, atau <b>Hapus akun</b>.
      </>,
      <>
        <b>Presensi</b>: di halaman sesi, <b>Catat / ubah</b> pada nama siswa (pilih Belum dicatat untuk menghapus catatan). Sesi yang sudah selesai tetap bisa diubah nama/jamnya. Sesi salah input: <b>Hapus sesi</b>.
      </>,
      <>
        <b>Tes Samapta</b>: kosongkan isian untuk menghapus nilai yang salah. Tes yang salah input: tab <b>Data tes</b> → <b>Hapus tes</b>.
      </>,
      <>
        <b>Keuangan</b>: <b>Ubah / hapus</b> pada baris transaksi; akun kas/bank dan kategori diubah atau dinonaktifkan di <Link href="/keuangan/master">Akun & periode</Link>.
      </>,
    ],
  },
  {
    id: "akhir-bulan",
    title: "Akhir bulan",
    roles: ["OWNER", "ADMIN"],
    steps: [
      <>
        <Link href="/akademik">Presensi</Link>: unduh rekap CSV bulan ini dan hubungi siswa yang kehadirannya di bawah 75%.
      </>,
      <>
        <Link href="/keuangan/master">Akun & periode</Link> (owner): cocokkan saldo kas dan rekening, lalu <b>Tutup bulan</b> bila semua cocok.
      </>,
      <>
        <Link href="/keuangan/laporan">Laporan</Link>: unduh PDF laba rugi, neraca, dan buku kas. Unduh juga cadangan data (owner).
      </>,
      ...(FITUR.rapor ? [<>Rapor: periksa pratinjau, isi catatan, lalu terbitkan.</>] : []),
    ],
  },
  {
    id: "siswa",
    title: "Siswa",
    roles: ["OWNER", "ADMIN", "SISWA"],
    steps: [
      <>
        <b>Presensi</b>: saat sesi dibuka, pindai QR lalu tekan <b>Ajukan hadir</b>. Tanpa QR: <Link href="/akademik">Presensi</Link> → <b>Ajukan</b>. Izin atau sakit wajib diberi keterangan.
      </>,
      <>Status Menunggu berarti pengajuan belum disahkan pelatih.</>,
      <>
        <b>Hasil Samapta</b>: nilai tiap materi, hasil akhir, klasifikasi, peringkat, dan perkembangan dari tes sebelumnya. Blangko sendiri bisa dicetak.
      </>,
    ],
  },
  {
    id: "wali",
    title: "Wali",
    roles: ["WALI"],
    steps: [
      <>
        <b>Beranda</b> menampilkan kehadiran bulan ini dan sisa tagihan setiap anak.
      </>,
      <>
        <b>Tagihan</b>: jadwal cicilan dan kuitansi setiap pembayaran.
      </>,
    ],
  },
  {
    id: "akun",
    title: "Masuk dan akun",
    roles: ALL,
    steps: [
      <>
        <b>Siswa</b>: username = kode siswa (mis. gan-0001). Masuk pertama, kosongkan PIN lalu tekan Masuk untuk membuat PIN 6 angka. <b>Owner</b>: username dan password.
      </>,
      <>
        <Link href="/akun-saya">Akun & PIN</Link>: ganti PIN atau password, ubah tampilan terang/gelap, atau keluar dari semua perangkat bila HP hilang.
      </>,
      <>Lupa PIN? Lapor ke owner untuk direset, lalu buat PIN baru saat masuk berikutnya.</>,
    ],
  },
];

export default async function GuidePage() {
  const actor = await requireActor();
  const sections = SECTIONS.filter((s) => s.roles.includes(actor.user.peran));

  return (
    <div className="page">
      <PageHead eyebrow="Bantuan" title="Panduan" description="Langkah yang paling sering dipakai: presensi, Tes Samapta, dan keuangan, sesuai peran akun Anda." actions={<PrintButton label="Cetak panduan" />} />
      <nav className="tabs" aria-label="Isi panduan">
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="tab">
            {s.title}
          </a>
        ))}
      </nav>
      {sections.map((s) => (
        <section className="card guide" id={s.id} key={s.id}>
          <div className="card-head">
            <h2>{s.title}</h2>
          </div>
          {s.intro ? <p className="muted">{s.intro}</p> : null}
          <ol className="guide-steps">
            {s.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

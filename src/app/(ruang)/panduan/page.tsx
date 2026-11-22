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
        <Link href="/keuangan">Keuangan</Link>: tekan <b>Siapkan akun & kategori</b>. Akun kas dan bank serta kategori pemasukan/pengeluaran langsung dibuat dan siap masuk laporan. Isi saldo awal kas dan bank di <Link href="/keuangan/lainnya">Keuangan → Lainnya</Link> → Akun & saldo awal.
      </>,
      <>
        Ingin melihat semua fitur berjalan dulu? <Link href="/pengaturan/pratinjau">Pengaturan → Mode pratinjau</Link> memakai data contoh tanpa menyentuh data asli.
      </>,
      <>
        Sekali saja: <Link href="/keuangan/lainnya">Keuangan → Lainnya</Link> → Penyesuaian laporan → verifikasi saldo awal neraca, agar laporan berstatus siap diperiksa.
      </>,
    ],
  },
  {
    id: "presensi",
    title: "Presensi",
    roles: ["OWNER", "ADMIN", "PENGAJAR"],
    steps: [
      <>
        <b>Sebelum latihan</b>: <Link href="/akademik">Presensi</Link> → tombol <b>+</b> (Buat sesi). Pilih peserta <b>Semua siswa aktif</b> (atau satu kelas).
      </>,
      <>
        <b>Jadwal rutin</b>: di lembar Buat sesi nyalakan <b>Ulangi</b>, pilih harinya (mis. Senin sampai Sabtu) dan <b>Sampai tanggal</b>. Semua sesi dibuat sekaligus dan bertanda <b>Berulang</b>. Saat mengubah atau menghapus, pilih <b>Hanya sesi ini</b> atau <b>Sesi ini dan berikutnya</b>.
      </>,
      <>
        <b>Saat mulai</b>: di layar <b>Hari ini</b>, pilih sesinya → <b>Buka sesi</b>, lalu <b>Tampilkan QR</b> (layar penuh). Siswa memindai dan menekan <b>Ajukan hadir</b>. QR berganti otomatis tiap 10 menit, jadi foto QR lama tidak berlaku.
      </>,
      <>
        Tekan <b>Sahkan semua</b> untuk pengajuan yang menunggu (tidak perlu bila QR langsung sah dinyalakan). Siswa tanpa HP: ketuk kartunya untuk mengganti status (Hadir → Izin → Sakit → Alfa); tahan lama untuk jam masuk atau catatan.
      </>,
      <>
        <b>Selesai</b>: <b>Tutup sesi</b>. Siswa yang belum tercatat dihitung alfa. Rekap bulanan bisa diunduh sebagai CSV.
      </>,
      <>
        Tab <b>Rekap</b>: siswa dengan kehadiran di bawah 75% punya tombol <b>WA wali</b> berisi pesan siap kirim. Pilihan bidang (Akademik, Fisik, KESWA, dan lain-lain) diatur di <Link href="/pengaturan/bidang-presensi">Pengaturan → Bidang presensi</Link>: tambah, ganti nama, urutkan, atau sembunyikan.
      </>,
    ],
  },
  {
    id: "samapta",
    title: "Tes Samapta",
    roles: ["OWNER", "ADMIN", "PENGAJAR"],
    intro: "Garjas A = nilai lari 12 menit. Garjas B = rata-rata nilai pull up (putra) atau chinning (putri), sit up, push up, dan shuttle run. Hasil akhir = (A + B) / 2. Nilai renang gaya dada ditampilkan terpisah.",
    steps: [
      <>
        <Link href="/samapta">Tes Samapta</Link> → <b>Tes baru</b>. Semua siswa aktif otomatis jadi peserta.
      </>,
      <>
        Di lapangan, ketuk <b>Lanjut isi</b> atau salah satu kotak pos. Mode lapangan menampilkan satu siswa per layar dengan papan angka besar; tekan <b>Simpan & lanjut</b> untuk siswa berikutnya. Semua tersimpan otomatis.
      </>,
      <>
        Isi jarak, jumlah gerakan, atau waktu sesuai pos. Nilai dihitung dari tabel berdasarkan jenis kelamin dan usia pada tanggal tes. Bila tanggal lahir kosong, acuan latihan memakai kelompok 18–25 tahun.
      </>,
      <>
        Tab <b>Hasil</b> menampilkan peringkat dan klasifikasi. Cetak blangko A4 per siswa atau semua sekaligus; <b>Cetak blangko kosong</b> untuk diisi tangan. <b>Unduh Excel (CSV)</b> berisi semua nilai peserta.
      </>,
      <>
        Buka baris siswa di peringkat lalu <b>Kirim hasil</b> untuk mengirim nilainya ke wali lewat WhatsApp. Halaman per siswa menampilkan grafik perkembangan dari tes ke tes.
      </>,
      <>
        Setelah semua lengkap, tekan <b>Tandai selesai</b> agar isian terkunci. Perlu koreksi? <b>Buka lagi</b>.
      </>,
    ],
  },
  {
    id: "latihan",
    title: "Latihan psikotes",
    roles: ["OWNER", "ADMIN"],
    intro: "Siswa berlatih Kraepelin, Pauli, angka hilang, dan simbol hilang dari HP masing-masing. Angka dan simbol dibuat acak terus saat dikerjakan, jadi setiap latihan berbeda. Setiap latihan yang selesai tersimpan satu baris di spreadsheet.",
    steps: [
      <>
        <Link href="/latihan">Latihan siswa</Link>: semua siswa aktif dalam satu daftar, dengan jumlah latihan minggu ini, skor terakhir, dan tren naik/turun.
      </>,
      <>
        Pilih <b>Perlu perhatian</b> untuk melihat siswa yang belum pernah latihan, 7 hari tidak latihan, atau skornya turun 5 poin atau lebih.
      </>,
      <>Ketuk nama siswa untuk melihat grafik skor, perbandingan aspek latihan pertama dan terakhir, serta hasil tiap latihan.</>,
      <>
        <b>Target mingguan</b>: tekan <b>Pasang target</b> (mis. 3 kali Kraepelin Standar per minggu). Siswa melihat progresnya di menu Latihan; filter <b>Belum memenuhi</b> menampilkan yang tertinggal, lengkap dengan tombol <b>WA siswa</b>.
      </>,
      <>
        <Link href="/latihan/klasemen">Klasemen</Link>: adu skor latihan Standar tiap minggu (Senin sampai Minggu). Tiap jenis memakai rata-rata 3 skor terbaik; peringkat 1 sampai 8 mendapat poin untuk klasemen umum. Siswa juga melihat tingkat (Perunggu, Perak, Emas) dan lencananya.
      </>,
      <>
        Ingin merasakan layarnya? <Link href="/latihan/coba">Coba latihan</Link>: hasilnya ditampilkan tetapi tidak disimpan.
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
        <b>Uang masuk</b>: <Link href="/keuangan">Keuangan</Link> → tombol <b>Uang masuk</b>, isi nominal di papan angka, kategori mis. <b>Pembayaran bimbel siswa</b>. Pilih <b>Dari siswa</b> agar pembayaran ini tampil di profil siswa (riwayat bayar, bukan tagihan).
      </>,
      <>
        <b>Uang keluar</b>: tombol <b>Uang keluar</b>, pilih kategori (honor, sewa, operasional, ATK, dan lain-lain) agar laba rugi rapi. Pindah uang kas ke bank lewat tombol <b>Pindah</b>.
      </>,
      <>
        <b>Salah catat</b>: ketuk barisnya di Riwayat untuk mengubah atau menghapus. Saldo dan laporan langsung menyesuaikan; jejak perubahannya tetap tersimpan.
      </>,
      <>
        <b>Laporan</b>: <Link href="/keuangan/laporan">Keuangan → Laporan</Link> → pilih periode → buku kas, laba rugi, atau neraca. Unduh PDF atau CSV.
      </>,
    ],
  },
  {
    id: "pengumuman",
    title: "Pengumuman dan WhatsApp",
    roles: ["OWNER", "ADMIN"],
    steps: [
      <>
        <Link href="/pengumuman">Pengumuman</Link> → <b>Tulis pengumuman</b>: judul, isi, dan <b>Tampil sampai</b>. Pengumuman tampil di beranda siswa sebagai <b>Info dari pelatih</b> lalu hilang sendiri setelah tanggalnya. Nyalakan <b>Sematkan</b> agar selalu paling atas.
      </>,
      <>Tombol <b>Kirim ke WA</b> membuka WhatsApp dengan teks pengumuman; pilih grup siswa lalu kirim.</>,
      <>
        Tombol WhatsApp di aplikasi (profil siswa, rekap presensi, latihan, hasil samapta) hanya membuka chat dengan pesan terisi; tidak ada yang terkirim sebelum Anda menekan kirim. Teks pesannya bisa diubah di <Link href="/pengaturan/pesan-wa">Pengaturan → Pesan WA</Link>.
      </>,
      <>
        <b>Kartu login</b>: <Link href="/pengaturan/akun">Pengaturan → Akun</Link> → <b>Cetak kartu login</b>. Satu lembar A4 berisi 8 kartu (nama, username, alamat aplikasi, QR). Berikan langsung ke siswanya, karena siapa pun yang tahu username bisa membuat PIN pertama.
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
        <b>Presensi</b>: ketuk kartu siswa untuk mengganti status (sampai kembali ke Belum untuk menghapus catatan). Sesi yang sudah selesai tetap bisa diubah nama/jamnya. Sesi salah input: <b>Hapus sesi</b>.
      </>,
      <>
        <b>Tes Samapta</b>: kosongkan isian untuk menghapus nilai yang salah. Tes yang salah input: buka hasil tes → <b>Hapus tes</b>.
      </>,
      <>
        <b>Keuangan</b>: ketuk baris transaksi untuk ubah atau hapus; akun kas/bank dan kategori diatur di <Link href="/keuangan/lainnya">Keuangan → Lainnya</Link>.
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
        <Link href="/keuangan/lainnya">Keuangan → Lainnya</Link> → Pencocokan & tutup bulan (owner): cocokkan saldo kas dan rekening, lalu <b>Tutup bulan</b> bila semua cocok.
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
      <>
        <b>Latihan</b>: pilih Kraepelin, Pauli, angka hilang, atau simbol hilang, pilih durasi (Singkat, Standar, atau Seperti tes asli), lalu mulai. Hasil keluar begitu waktu habis: skor, ketelitian, kecepatan, stabilitas, performa, dan kurva kerja.
      </>,
      <>
        <Link href="/latihan/progres">Progres saya</Link>: grafik skor dari latihan ke latihan. Bila sinyal putus saat menyimpan, hasil disimpan di HP dan bisa dikirim ulang. Kartu <b>Target minggu ini</b> menunjukkan berapa kali lagi perlu latihan.
      </>,
      <>
        <Link href="/latihan/klasemen">Klasemen</Link>: posisimu minggu ini di tiap jenis dan klasemen umum, tingkat (Perunggu, Perak, Emas), dan lencana. Yang dihitung hanya latihan durasi Standar, minimal 3 kali per jenis.
      </>,
      <><b>Info dari pelatih</b> di beranda berisi pengumuman terbaru: jadwal tes, perlengkapan, atau perubahan sesi.</>,
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
      <>
        <b>Pasang di HP</b>: tekan tombol <b>Pasang</b> di samping tombol tema. Di Android dan komputer muncul tawaran pasang; di iPhone ikuti langkahnya (Bagikan → Tambah ke Layar Utama).
      </>,
    ],
  },
];

export default async function GuidePage() {
  const actor = await requireActor();
  const sections = SECTIONS.filter((s) => s.roles.includes(actor.user.peran));

  return (
    <div className="page">
      <PageHead eyebrow="Bantuan" title="Panduan" description="Langkah yang paling sering dipakai: presensi, Tes Samapta, latihan, dan keuangan, sesuai peran akun Anda." actions={<PrintButton label="Cetak panduan" />} />
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

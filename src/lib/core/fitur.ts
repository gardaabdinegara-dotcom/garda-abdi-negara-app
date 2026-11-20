// Fitur yang DISEMBUNYIKAN, bukan dihapus (keputusan owner 17 Nov 2026).
// Pengguna hanya Owner (merangkap guru & pelatih) dan Siswa; modul yang dipakai: Presensi, Tes Samapta, Keuangan.
// Ubah ke true untuk menampilkan lagi. Kode dan data di spreadsheet tetap utuh.
export const FITUR = {
  /** Nilai & tes SKD/akademik/psikotes. */
  nilai: false,
  tugas: false,
  rapor: false,
  /** Pengukuran kesehatan terpisah; kini tercakup di blangko Tes Samapta (tensi, tinggi, berat). */
  kesehatan: false,
  /** Membuat akun Admin, Pengajar, dan Wali. */
  peranTambahan: false,
  /**
   * Tagihan siswa: tarif, tagihan & cicilan, piutang, kuitansi, dan halaman tagihan siswa.
   * Disembunyikan 17 Nov 2026: pembayaran diurus manual, owner cukup mencatat pemasukan dan
   * pengeluaran di Keuangan → Transaksi, lalu laporan keuangan dibuat otomatis.
   */
  tagihan: false,
  /**
   * Program & kelas. Disembunyikan 20 Nov 2026: semua sesi untuk semua siswa aktif, kelas tidak dipakai.
   * Tab di Pengaturan tidak tampil; halamannya tetap bisa dibuka lewat alamat /pengaturan/kelas-program.
   */
  kelas: false,
} as const;

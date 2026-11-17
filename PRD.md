# PRD — Ruang Garda (aplikasi gabungan Garda Abdi Negara)

| Informasi | Keterangan |
| --- | --- |
| Versi dokumen | 0.2 — disetujui pemilik |
| Tanggal | 13 November 2026 |
| Menggantikan | `Project/_arsip/Laporan Keuangan` dan `Project/_arsip/Presensi/garda-presensi` (keduanya belum pernah dideploy) |
| Penyimpanan data | Google Sheets, dua spreadsheet baru |
| Login | Username + password untuk semua peran |
| Hosting | Vercel |
| Status | Rencana dan keenam keputusan di bagian 11 disetujui pada 13 November 2026. Belum ada kode. |

## 1. Ringkasan

Ruang Garda menyatukan dua aplikasi yang sebelumnya terpisah — Presensi & Rapor serta Laporan Keuangan — menjadi satu aplikasi dengan satu login, satu daftar siswa, dan satu tampilan. Isinya dibagi menjadi dua modul:

- **Akademik**: jadwal sesi, presensi, nilai & tes, tugas, kesehatan, dan rapor bulanan.
- **Keuangan**: tagihan, cicilan, pembayaran & kuitansi, transaksi kas, dan laporan keuangan.

Kedua modul berbagi **fondasi** yang sama: akun & peran, data siswa, kelas, program, dan pendaftaran. Data keuangan disimpan di spreadsheet terpisah dan hanya dikirim ke peran yang berhak.

### Masalah yang diselesaikan

| Masalah saat ini | Penyelesaian |
| --- | --- |
| Siswa diinput dua kali dan tidak bisa dicocokkan antar-aplikasi | Satu tabel Siswa dengan `siswa_id` dan `kode_siswa` bersama |
| Dua cara login (Google di Keuangan, password di Presensi) | Satu login username + password untuk semua peran |
| Orang tua tidak bisa melihat tagihan; owner tidak melihat kehadiran dan kas sekaligus | Portal wali dan beranda owner lintas modul |
| Setiap request membaca seluruh spreadsheet sehingga makin lambat | Membaca hanya tab yang dibutuhkan halaman, ditambah cache singkat |
| Dua kode dengan gaya berbeda (React vs JavaScript polos) | Satu kode Next.js + TypeScript, modul terpisah |

## 2. Pengguna dan peran

Lembaga satu lokasi, sekitar 30 siswa aktif, 1–3 staf, beberapa pengajar.

| Peran | Siapa | Ringkasan akses |
| --- | --- | --- |
| **OWNER** | Pemilik lembaga | Semua fitur, termasuk akun, pengaturan, koreksi keuangan, tutup periode, dan cadangan |
| **ADMIN** | Staf administrasi | Siswa, kelas, jadwal, akademik penuh, akun pengajar/siswa/wali; akses keuangan sesuai tingkat (lihat 2.2) |
| **PENGAJAR** | Pengajar/pelatih | Kelas yang diajarnya saja: sesi, presensi, nilai, tugas, draf rapor |
| **SISWA** | Peserta bimbel | Data dirinya: pengajuan presensi & QR, nilai, tugas, rapor terbit |
| **WALI** | Orang tua/wali | Data anak yang ditautkan: presensi, rapor terbit, tagihan & kuitansi |

### 2.1 Matriks hak akses

| Tindakan | OWNER | ADMIN | PENGAJAR | SISWA | WALI |
| --- | :-: | :-: | :-: | :-: | :-: |
| Kelola siswa, kelas, program, pendaftaran | ✓ | ✓ | – | – | – |
| Kelola akun pengajar, siswa, wali | ✓ | ✓ | – | – | – |
| Kelola akun ADMIN dan OWNER | ✓ | – | – | – | – |
| Pengaturan lembaga & batas penilaian | ✓ | – | – | – | – |
| Buat/buka/tutup sesi | ✓ | ✓ | kelasnya | – | – |
| Catat & sahkan presensi | ✓ | ✓ | kelasnya | – | – |
| Ajukan presensi / pindai QR | – | – | – | ✓ | – |
| Input nilai, tes, tugas, kesehatan | ✓ | ✓ | kelasnya | – | – |
| Kumpulkan tugas (tautan) | – | – | – | ✓ | – |
| Terbitkan & revisi rapor | ✓ | ✓ | draf saja | – | – |
| Lihat rapor terbit | ✓ | ✓ | kelasnya | dirinya | anaknya |
| Lihat tagihan & kuitansi | ✓ | sesuai tingkat | – | – (lihat 11) | anaknya |
| Catat pembayaran, biaya, transfer | ✓ | tingkat "catat" | – | – | – |
| Diskon, koreksi, refund, pembalik | ✓ | – | – | – | – |
| Master keuangan, tutup periode, laporan lengkap | ✓ | – | – | – | – |
| Cadangan & pemulihan | ✓ | – | – | – | – |

### 2.2 Tingkat akses keuangan untuk ADMIN

Menggantikan peran VIEWER pada aplikasi Keuangan lama. Diatur per akun ADMIN oleh OWNER:

- **Tidak ada** (bawaan): modul Keuangan tidak tampil sama sekali.
- **Lihat**: dashboard, tagihan, dan laporan ringkas tanpa kontak pribadi; tanpa mutasi.
- **Catat**: seperti "Lihat", ditambah menerbitkan tagihan sesuai tarif, mencatat pembayaran, biaya, dan transfer.

Semua pemeriksaan hak akses dilakukan di server. Peran tanpa akses keuangan tidak pernah menerima data keuangan dalam respons API.

## 3. Menu per peran

Desktop memakai navigasi atas berbentuk pil; ponsel (≤900 px) memakai navigasi bawah lima tombol dengan menu "Lainnya".

**OWNER / ADMIN**

```
Beranda
Siswa            → daftar, profil siswa (identitas, pendaftaran, presensi, nilai, rapor, tagihan)
Akademik         → Jadwal & Presensi · Nilai & Tes · Tugas · Kesehatan · Rapor
Keuangan         → Ringkasan · Tagihan · Transaksi · Laporan          (sesuai tingkat akses)
Pengaturan       → Lembaga · Kelas & Program · Akun & Akses · Master Keuangan · Cadangan
Ponsel: Beranda · Siswa · Presensi · Keuangan · Lainnya
```

**PENGAJAR**: Beranda · Jadwal & Presensi · Nilai & Tes · Tugas · Rapor · Akun Saya

**SISWA**: Beranda · Presensi · Nilai · Tugas · Rapor · Akun Saya

**WALI**: Beranda · Presensi · Rapor · Tagihan · Akun Saya (dengan pemilih anak bila lebih dari satu)

### 3.1 Isi Beranda

| Peran | Isi utama |
| --- | --- |
| OWNER | Sesi hari ini, presensi menunggu verifikasi, kehadiran bulan ini, rata-rata SKD, saldo kas & bank, kas masuk/keluar bulan ini, tunggakan jatuh tempo |
| ADMIN | Sama seperti OWNER; kartu keuangan mengikuti tingkat akses |
| PENGAJAR | Sesi hari ini, pengajuan yang perlu disahkan, tugas belum diperiksa, siswa dengan kehadiran rendah |
| SISWA | Sesi hari ini (tombol ajukan hadir), nilai terakhir dibanding acuan SKD, tugas mendekati tenggat |
| WALI | Kehadiran anak bulan ini, rapor terbaru, tagihan & jatuh tempo berikutnya |

## 4. Fitur

### 4.1 Fondasi (baru dan gabungan)

- Login username + password, wajib ganti password awal, sesi 8 jam, pembatasan percobaan login, cabut semua sesi per akun.
- Akun & akses: buat akun, atur peran, tautkan siswa ke akun SISWA, tautkan anak ke akun WALI, tetapkan kelas pengajar, atur tingkat akses keuangan ADMIN.
- **Profil siswa tunggal**: identitas, kontak siswa & wali, jalur target (TNI/Polri/Kedinasan), kode siswa unik `GAN-0001`, status aktif.
- **Pendaftaran** sebagai penghubung: siswa → program → kelas/angkatan → periode → status (aktif, cuti, selesai, berhenti). Status cuti berlaku di presensi dan tagihan sekaligus.
- Kelas dan program dikelola di satu tempat.
- Mode terang/gelap, tampilan ponsel dan desktop, PWA dasar.

### 4.2 Modul Akademik (dari Presensi, dipertahankan)

- Sesi per kelas (Akademik, SKD, Psikotes, Fisik) dengan status akan datang/aktif/selesai/dibatalkan; daftar peserta dibekukan saat sesi dibuka.
- Presensi oleh pengajar, pengajuan mandiri siswa, dan QR sesi (berlaku 10 menit); pengajuan menunggu verifikasi; sesi tidak bisa ditutup bila masih ada pengajuan; siswa tanpa catatan dihitung alfa; keterlambatan memakai toleransi lembaga.
- Nilai & tes: SKD (TWK/TIU/TKP), akademik, psikotes, fisik (hasil mentah + skor + protokol). Nol dihitung, kosong tidak.
- Tugas dan pengumpulan berupa tautan, dengan status periksa dan nilai.
- Kesehatan: tinggi, berat, IMT, tekanan darah, catatan pemeriksa.
- Rapor bulanan tujuh bagian (akademik, SKD, psikotes, fisik, tugas, kesehatan, kehadiran), draf → terbit dengan snapshot, revisi menjadi versi baru, riwayat versi, cetak/PDF.
- Ekspor CSV presensi.

### 4.3 Modul Keuangan (dari Laporan Keuangan, dipertahankan)

- Tarif program, ketentuan biaya per pendaftaran (paket/bulanan, tarif disepakati, hari jatuh tempo).
- Tagihan paket dan bulanan (massal), jadwal cicilan, pembayaran sebagian, kuitansi cetak.
- Penerimaan lain, biaya, modal, prive, pinjaman, transfer dua sisi.
- Koreksi lewat pembalik, penyesuaian tagihan, refund, diskon — semuanya dengan alasan dan jejak pelaku.
- Laporan: Buku kas, Laba rugi, Neraca, Aset & penyusutan, Omzet & pajak, Pemeriksaan, Ringkasan kas; CSV, cetak, PDF satuan dan buku tahunan.
- Master akun kas/bank, kategori, pemetaan laporan, aset, jurnal nonkas, tarif pajak; tutup/buka periode.

### 4.4 Fitur lintas modul (rilis pertama)

1. **Profil siswa lengkap**: satu halaman berisi identitas, pendaftaran, kehadiran, nilai, rapor, dan — untuk peran berhak — tagihan.
2. **Portal wali**: presensi, rapor terbit, tagihan, riwayat pembayaran, dan unduh kuitansi untuk anak yang ditautkan.
3. **Beranda owner** yang menggabungkan kartu akademik dan keuangan.
4. **Pendaftaran terpadu**: mendaftarkan siswa sekaligus menyiapkan ketentuan biaya dan menawarkan penerbitan tagihan pertama.

### 4.5 Tahap berikutnya (di luar rilis pertama)

- Pengingat WhatsApp (tunggakan, ketidakhadiran, rapor terbit), dimulai dengan tautan `wa.me` tanpa biaya.
- Rekap honor pengajar dari sesi yang benar-benar diajar.
- Impor nilai tryout dari `apps.gardaabdinegara.com` ke bagian SKD rapor.
- Unggah bukti transaksi dan berkas tugas ke penyimpanan privat.
- Cadangan otomatis terjadwal, tagihan bulanan terjadwal, anggaran vs realisasi.

## 5. Struktur data

Dua spreadsheet baru, dibagikan hanya kepada service account baru dan OWNER:

- **Spreadsheet A — "Garda · Inti & Akademik"**
- **Spreadsheet B — "Garda · Keuangan"** (tidak dibagikan ke staf lain)

Prinsip yang sama dengan aplikasi Keuangan lama: satu baris per entitas, kolom yang mudah dibaca, ID unik tetap, kolom audit `created_at, created_by, updated_at, updated_by`, dan tab operasi di setiap spreadsheet (**Operasi** di A, **Operasi_Keuangan** di B) sebagai jejak perubahan dan pencegah simpan ganda. Format event-sourcing (JSON per baris) dari Presensi tidak dipakai lagi karena sulit dibaca di Sheets.

### 5.1 Spreadsheet A — Inti & Akademik

| Tab | Kolom utama | Catatan |
| --- | --- | --- |
| Pengaturan | key, value, updated_at, updated_by | Nama lembaga, lokasi, zona waktu, toleransi terlambat, kapasitas, batas predikat, acuan SKD, penghitung kode siswa |
| Pengguna | user_id, username, nama, peran, password_hash, wajib_ganti_password, versi_otorisasi, akses_keuangan, aktif, terakhir_masuk | Hash scrypt; `versi_otorisasi` dinaikkan untuk mencabut sesi |
| Tautan_Akun | tautan_id, user_id, jenis (SISWA/WALI/PENGAJAR_KELAS), siswa_id, kelas_id | Menggantikan daftar ID di dalam JSON |
| Siswa | siswa_id, kode_siswa, nama, jenis_kelamin, tanggal_lahir, jalur_target, no_wa, nama_wali, no_wa_wali, tanggal_daftar, aktif, catatan | `kode_siswa` dibuat dari penghitung, unik dan tidak bisa diubah |
| Program | program_id, nama_program, target_seleksi, aktif | Tanpa tarif |
| Kelas | kelas_id, nama_kelas, program_id, angkatan, aktif | Menggantikan "group" berupa teks |
| Pendaftaran | pendaftaran_id, siswa_id, program_id, kelas_id, tanggal_mulai, tanggal_selesai, status | Tanpa angka biaya |
| Sesi | sesi_id, nama, tanggal, jam_mulai, jam_selesai, jenis, kelas_id, pengajar_id, status, peserta_ids | `peserta_ids` dibekukan saat sesi dibuka |
| Presensi | presensi_id (sesi:siswa), sesi_id, siswa_id, status, status_diajukan, metode, waktu, terlambat, catatan, disahkan_oleh, disahkan_pada | |
| Hasil_Tes | tes_id, siswa_id, kategori, komponen, nama_tes, tanggal, twk, tiu, tkp, skor, hasil_mentah, protokol, sumber, catatan, pengajar_id, diarsipkan | `sumber` disiapkan untuk impor tryout |
| Tugas | tugas_id, nama, bidang, kelas_id, tenggat, instruksi, pengajar_id | |
| Pengumpulan | pengumpulan_id, tugas_id, siswa_id, tautan, catatan, status, nilai, diperiksa_oleh | |
| Kesehatan | ukur_id, siswa_id, tanggal, tinggi_cm, berat_kg, sistolik, diastolik, catatan, pemeriksa | |
| Rapor | rapor_id, siswa_id, periode, versi, status, catatan, snapshot_json, diterbitkan_oleh, diterbitkan_pada | Snapshot tetap disimpan agar rapor terbit tidak berubah |
| Operasi | operation_id, request_hash, aksi, entity_type, entity_id, actor_id, committed_at, alasan, before_json, after_json, result_json | |

### 5.2 Spreadsheet B — Keuangan

Mengambil struktur v2 aplikasi Keuangan lama hampir apa adanya, dengan perubahan berikut:

- Tab **Siswa**, **Program**, **Pendaftaran**, dan **Pengguna** dihapus dari spreadsheet ini; semuanya merujuk ke spreadsheet A lewat `siswa_id`, `program_id`, `pendaftaran_id`, `user_id`.
- Tab baru **Tarif_Program** (program_id, skema_default, tarif_default, berlaku_mulai) dan **Ketentuan_Biaya** (pendaftaran_id, skema_biaya, tarif_disepakati, hari_jatuh_tempo, berlaku_mulai) menampung angka biaya yang dikeluarkan dari spreadsheet A.

Tab yang dipertahankan: Tagihan, Jadwal_Tagihan, Penyesuaian_Tagihan, Akun, Kategori, Transaksi, Pemetaan_Laporan, Aset, Saldo_Neraca, Jurnal_Laporan, Tarif_Pajak, Pembayaran_Pajak, serta **Pengaturan_Keuangan** dan **Operasi_Keuangan** (dulu Pengaturan dan Operasi).

Tidak ada nama tab yang sama di spreadsheet A dan B. Karena itu satu spreadsheet latihan bisa menampung tab keduanya, cukup dengan mengisi `SHEET_ID_INTI` dan `SHEET_ID_KEUANGAN` dengan ID yang sama.

### 5.3 Operasi yang menyentuh dua spreadsheet

Google Sheets tidak bisa menyimpan dua spreadsheet dalam satu langkah atomik. Operasi lintas spreadsheet (misalnya pendaftaran terpadu) dijalankan dua langkah dengan `operation_id` yang sama: spreadsheet A lebih dulu, lalu B. Bila langkah B gagal, aplikasi menampilkan "Tagihan belum diterbitkan" dengan tombol ulangi; tidak ada data yang dobel karena setiap langkah idempoten.

## 6. Desain tampilan

Melanjutkan tema **Terrace** yang sudah dipakai kedua aplikasi lama:

- Terang: latar krem `#f7f6f0`, permukaan `#fffef9`, tinta `#273e34`, warna utama hijau `#356c51`.
- Gelap: latar `#18221c`, warna utama sage `#b6d398`.
- Huruf: Manrope (judul) dan DM Sans (isi), dimuat lokal.
- Sudut membulat, tombol berbentuk pil, kartu dengan permukaan terang.
- **Logo resmi elang** (`_arsip/Laporan Keuangan/brand/garda-resmi-hd-v1/`) dipakai di header, halaman masuk, kuitansi, rapor, PDF, dan ikon PWA (ditambah ikon PNG & apple-touch-icon).

Yang diperbaiki dibanding aplikasi lama:

- Satu set token warna dan komponen bersama (tombol, kartu, statistik, tabel yang berubah menjadi kartu di ponsel, form, dialog, tab, lencana status). Sisa CSS tema lama tidak dibawa.
- Halaman masuk tunggal: "Disiplin hari ini. Siap mengabdi esok hari." dengan logo resmi.
- Warna status konsisten di semua modul: hadir/lunas (hijau), menunggu/jatuh tempo (kuning), alfa/tunggakan (merah), izin/sakit (biru).
- Gaya cetak terang untuk rapor, kuitansi, dan laporan, walaupun aplikasi dalam mode gelap.
- Aksesibilitas: kontras memenuhi WCAG AA, fokus keyboard terlihat, input ponsel 16 px agar tidak memperbesar layar, sasaran sentuh minimal 44 px.

## 7. Arsitektur teknis

- **Next.js + TypeScript** (App Router), Node.js 24, deploy di Vercel.
- Struktur kode:

```
src/
  core/        auth, akun & peran, siswa, kelas, program, pendaftaran, pengaturan
  akademik/    sesi, presensi, nilai, tugas, kesehatan, rapor
  keuangan/    tagihan, transaksi, laporan & PDF, master
  sheets/      klien Sheets, repositori per spreadsheet, koordinator penulisan, migrasi
  ui/          komponen dan token desain Terrace
```

- **Membaca data**: hanya tab yang dibutuhkan tiap halaman lewat `batchGet`, ditambah cache singkat yang dihapus setiap ada penulisan. Ini mengatasi masalah aplikasi lama yang membaca seluruh spreadsheet di setiap request.
- **Menulis data**: pola teruji dari aplikasi Keuangan — `operation_id` dari klien, gerbang Redis per spreadsheet (dengan batas waktu agar tidak menggantung), satu `batchUpdate`, catatan di tab Operasi, dan status "belum pasti" yang bisa dicek ulang.
- **Login**: hash scrypt dan aturan akun dari Presensi; sesi berupa cookie bertanda tangan (HttpOnly, Secure, SameSite) yang dicek terhadap `versi_otorisasi`; pembatasan percobaan login disimpan di Redis, bukan di Sheets; header keamanan termasuk CSP.
- **Akun OWNER pertama** dibuat lewat perintah setup di komputer pengelola, bukan file teks berisi password.
- **Rahasia** (JSON service account, ID spreadsheet, secret sesi, Redis) hanya di environment variable Vercel dan `.env.local` yang diabaikan Git.
- **Logika yang dipindahkan dari arsip**: aturan keuangan, pelaporan, dan PDF (`lib/domain.ts`, `lib/reporting.ts`, `lib/report-*.ts`) beserta 86 tesnya; aturan presensi, penilaian, rapor, dan akses (`src/server/domain.mjs`, `auth.mjs`) beserta 23 tesnya, diubah ke TypeScript.
- **Pengujian**: tes aturan bisnis, matriks hak akses untuk setiap peran, dan uji alur di browser dengan Playwright (ponsel dan desktop).

### 7.1 Environment yang dibutuhkan

| Nama | Isi |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Isi JSON service account baru |
| `SHEET_ID_INTI` | ID spreadsheet A |
| `SHEET_ID_KEUANGAN` | ID spreadsheet B |
| `AUTH_SECRET` | Secret acak minimal 32 karakter |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Redis Upstash (paket gratis cukup) |
| `DATA_MODE` | `sheets` (produksi) atau `lokal` (pengembangan) |
| `APP_TIMEZONE` | Opsional, bawaan `Asia/Jakarta` |

## 8. Tahapan pengerjaan

| Fase | Isi | Selesai bila |
| --- | --- | --- |
| **0. Persiapan (Anda)** | Spreadsheet Inti & Akademik, Keuangan, dan latihan; service account baru (kunci lama dicabut); akun Upstash Redis; akun/proyek Vercel; subdomain | ID spreadsheet dan kredensial tersedia di `.env.local` |
| **1. Fondasi** | Kerangka Next.js, desain Terrace + logo, perintah setup tab & header, login & akun, siswa, kelas, program, pendaftaran | OWNER bisa masuk, membuat akun semua peran, dan mengelola siswa & kelas di ponsel dan desktop |
| **2. Akademik** | Sesi, presensi (pengajar, mandiri, QR), nilai & tes, tugas, kesehatan, rapor | Seluruh skenario Presensi lama lulus tes dan bisa dijalankan per peran |
| **3. Keuangan** | Tarif & ketentuan biaya, tagihan, pembayaran & kuitansi, transaksi, laporan & PDF, master, tutup periode, cadangan | Seluruh 86 skenario Keuangan lama lulus pada struktur data baru |
| **4. Lintas modul & rilis** | Profil siswa lengkap, portal wali, beranda owner, uji hak akses & alur browser, deploy Vercel, panduan singkat | Uji coba dengan data nyata terbatas berjalan tanpa masalah |

Setiap fase diakhiri dengan pratinjau yang bisa Anda coba sebelum fase berikutnya dimulai.

## 9. Ukuran keberhasilan

- Siswa baru cukup didaftarkan sekali dan langsung tampil di presensi, rapor, dan tagihan.
- Halaman utama tetap terbuka dalam ±2 detik dengan data satu tahun ajaran (±30 siswa, ±1.500 baris presensi, ±500 transaksi).
- Tidak ada data keuangan pada respons API untuk peran tanpa akses keuangan (diuji otomatis).
- Pengajar dapat mengesahkan presensi satu sesi dalam kurang dari 1 menit di ponsel.
- Rapor, kuitansi, dan laporan tercetak rapi di A4.

## 10. Di luar cakupan rilis pertama

Payment gateway, sinkronisasi mutasi bank, banyak cabang, aplikasi Android/iOS asli, konversi nilai jasmani resmi otomatis, akuntansi akrual penuh, dan migrasi data dari spreadsheet lama (keduanya belum berisi data siswa nyata).

## 11. Keputusan yang disetujui (13 November 2026)

Selain tiga keputusan dasar (satu aplikasi dengan modul terpisah, Google Sheets, login username + password):

| # | Pertanyaan | Keputusan |
| --- | --- | --- |
| 1 | Apakah staf ADMIN mencatat pembayaran? | Ya, tingkat akses keuangan diatur per akun (bawaan: tidak ada) |
| 2 | Mode "data contoh" di browser dipertahankan? | Tidak; diganti spreadsheet latihan terpisah agar perilakunya sama persis dengan data nyata dan kodenya lebih sederhana |
| 3 | Siswa perlu login di rilis pertama? | Ya, karena pengajuan presensi dan QR memerlukannya |
| 4 | Siswa ikut melihat tagihannya sendiri? | Tidak; tagihan hanya untuk WALI, OWNER, dan ADMIN berhak |
| 5 | Nama dan alamat aplikasi | "Ruang Garda" di subdomain sendiri, mis. `ruang.gardaabdinegara.com` (`apps.` sudah dipakai platform soal); subdomain final ditetapkan saat deploy |
| 6 | Data lama dipindahkan? | Tidak; mulai dari spreadsheet kosong |

Karena keputusan 2, Fase 0 menyiapkan **tiga** spreadsheet: Inti & Akademik, Keuangan, dan satu spreadsheet latihan (berisi tab kedua spreadsheet, dipakai untuk pratinjau dan pelatihan staf).

# Ruang Garda

Satu aplikasi web untuk Garda Abdi Negara: akun semua peran, data siswa, program, kelas, pendaftaran, jadwal & presensi, nilai, tugas, kesehatan, rapor, serta keuangan (tagihan, pembayaran, kas, dan laporan). Data disimpan di Google Sheets milik lembaga. Rencana lengkapnya ada di [PRD.md](PRD.md).

**Status: kode Fase 1–4 selesai** (fondasi, akademik, keuangan, lintas modul). Yang tersisa adalah deploy dan uji coba dengan data nyata, yang menunggu Fase 0 (spreadsheet, service account baru, Upstash, Vercel) dan persetujuan pemilik. Lihat PRD §8.

## Arah 17 November 2026: Owner + Siswa, tiga modul

Setelah pratinjau klien disetujui, aplikasi disederhanakan:

- **Pengguna:** hanya **Owner** (merangkap guru dan pelatih) dan **Siswa**. Membuat akun Admin, Pengajar, dan Wali disembunyikan; akun siswa dibuat otomatis saat siswa ditambah atau diimpor.
- **Modul yang tampil:** Presensi, **Tes Samapta**, dan Keuangan. Nilai SKD, Tugas, Rapor, dan Kesehatan **disembunyikan, bukan dihapus**. Sakelarnya ada di `src/lib/core/fitur.ts`; ubah ke `true` untuk menampilkan lagi. Data lama tetap utuh.
- **Presensi:** sesi bisa untuk **semua siswa aktif** tanpa kelas. Opsi **Hadir lewat QR langsung sah** ada di Pengaturan → Lembaga; izin, sakit, dan pengajuan tanpa QR tetap menunggu pengesahan.
- **Tes Samapta** (`/samapta`):
  - Sesi tes berisi semua siswa aktif.
  - Hasil diisi per pos dari HP: tensi I–III dan riwayat kesehatan, tinggi/berat (IMT otomatis), lari 12 menit, pull up (putra) atau chinning (putri), sit up, push up, shuttle run 6 × 10 m, dan renang 50 m.
  - Garjas A = nilai lari. Garjas B = rata-rata empat nilai B. Hasil akhir = (A + B) / 2.
  - Klasifikasi: Baik Sekali ≥ 81, Baik 61–80, Cukup 41–60, Kurang ≤ 40 (bisa diubah).
  - Nilai diisi manual sampai tabel nilai resmi tersedia.
  - Blangko A4 bisa dicetak terisi (per siswa atau semua) di `/cetak/samapta/[tes]` atau kosong di `/cetak/samapta/kosong`. Kop, tempat, kota, dan penanda tangan diatur di Pengaturan → Lembaga.
- **Siswa** melihat presensi dan hasil samapta (dengan peringkat dan perkembangan).
- **Keuangan catat manual:** tagihan, cicilan, tarif, piutang, dan kuitansi siswa disembunyikan (`FITUR.tagihan = false`). Owner mencatat pemasukan dan pengeluaran di **Keuangan → Pemasukan & pengeluaran**, lalu laporan (buku kas, laba rugi, neraca) dibuat otomatis. **Siapkan akun & kategori** membuat kategori lembaga yang sudah dipetakan ke laporan (mis. Pembayaran bimbel siswa → Pendapatan jasa). Setiap transaksi punya **Ubah / hapus**: transaksi lama dibalik pada tanggal aslinya, jadi jejaknya tetap ada.
- **Owner = superadmin:** ubah atau nonaktifkan data di semua bagian. Ganti nama siswa ikut mengganti nama akun loginnya, dan menonaktifkan siswa menutup akunnya. Sesi presensi yang sudah selesai bisa diubah atau dibatalkan (lalu dipulihkan), dan Tes Samapta bisa dibatalkan atau dipulihkan. Data tidak pernah benar-benar dihapus.

**Spreadsheet perlu diperbarui sekali** sebelum versi ini dipakai dengan Google Sheets: jalankan `npm run setup:sheets` (pratinjau), lalu `npm run setup:sheets -- --apply`. Perintah ini:

- menambah tab `Tes_Samapta` dan `Hasil_Samapta`;
- menambah kolom `tempat_lahir` dan `asal_sekolah` di **ujung kanan** tab `Siswa`. Data lama tidak diubah.

Tanpa langkah ini, mode Sheets menampilkan galat "Header tab Siswa berubah".

## Yang sudah bisa dipakai

| Peran | Bisa melakukan |
| --- | --- |
| Owner | Semua yang dilakukan Admin, ditambah: mengelola akun Owner/Admin, memberi akses keuangan Admin (Tidak ada / Lihat / Catat), dan mengubah pengaturan lembaga (kapasitas, toleransi terlambat, predikat, acuan SKD). Di keuangan: tarif program, tarif khusus, diskon, penyesuaian, refund, koreksi (pembalik), akun kas/bank, kategori, pencocokan saldo, tutup/buka bulan, pengaturan laporan, dan cadangan data |
| Admin | Membuat akun Pengajar, Siswa, dan Wali; membuat password sementara; mengeluarkan akun dari semua perangkat; menautkan siswa/kelas; mengelola siswa, program, kelas, dan pendaftaran; semua pekerjaan akademik untuk semua kelas; menerbitkan dan merevisi rapor; ekspor CSV presensi. Keuangan sesuai akses akunnya: **Lihat** (ringkasan, tagihan, transaksi, laporan) atau **Catat** (juga mengatur biaya pendaftaran sesuai tarif program, menerbitkan tagihan, mencatat pembayaran, biaya, dan transfer) |
| Pengajar | Membuat sesi untuk kelas yang ditautkan, membuka sesi dan menampilkan QR, mengesahkan atau menolak pengajuan, mencatat presensi, menutup sesi; mengisi nilai, kesehatan, dan catatan rapor; membuat tugas dan menilai pengumpulan; ekspor CSV presensi kelasnya |
| Siswa | Mengajukan hadir/izin/sakit saat sesi dibuka (mandiri atau pindai QR), melihat rekap kehadiran, nilai, tugas (kirim tautan hasil), dan rapor terbit |
| Wali | Melihat kehadiran, rapor terbit, profil, tagihan, jadwal cicilan, riwayat pembayaran, dan kuitansi anak yang ditautkan (tanpa data keuangan lembaga) |

Fitur pendukung:

- Kode siswa otomatis `GAN-0001`, `GAN-0002`, dst. Kode tidak pernah ganda dan tidak dipakai ulang.
- Kapasitas siswa aktif ditegakkan (bawaan 30).
- Password sementara 16 karakter, hanya ditampilkan sekali dan wajib diganti saat pertama masuk.
- Tampilan "Profesional modern" dengan palet hijau army dan oranye, mode terang dan gelap:
  - **Desktop:** menu samping dan pencarian siswa.
  - **Tablet:** menu berupa ikon.
  - **Ponsel:** bar atas ringkas dan menu bawah 5 tombol.
- Beranda berisi:
  - kartu sambutan dengan hal yang perlu ditindak hari ini
  - kapasitas siswa
  - kartu angka
  - grafik kehadiran 8 hari terakhir
  - siswa per jalur
  - jadwal hari ini, keuangan bulan berjalan, dan pintasan
- Grafik digambar dengan SVG, karena CSP tidak mengizinkan style inline. Huruf Plus Jakarta Sans disajikan dari server sendiri.
- Presensi: peserta sesi dibekukan saat sesi dibuka; pengajuan siswa menunggu pengesahan; sesi tidak bisa ditutup selama masih ada pengajuan; siswa tanpa catatan dihitung alfa; keterlambatan memakai toleransi lembaga (bawaan 10 menit); sesi batal tidak dihitung.
- QR presensi berlaku 10 menit, ditandatangani server, dan diperbarui otomatis di layar pengajar. Bila siswa belum masuk, setelah login ia dibawa kembali ke halaman QR.
- Nilai: SKD (TWK maks 150, TIU 175, TKP 225) lulus acuan latihan hanya bila ketiga komponen memenuhi acuan; akademik, psikotes, dan fisik memakai skor 0–100 (fisik juga hasil asli dan protokol). Nilai nol dihitung, komponen kosong tidak.
- Rapor bulanan tujuh bagian (akademik, SKD, psikotes, fisik, tugas, kesehatan, kehadiran). Rapor terbit disimpan sebagai snapshot sehingga tidak berubah walau nilai diubah; revisi menjadi versi baru, dan siswa/wali tetap melihat versi terbit terakhir. Bisa dicetak atau disimpan PDF dari browser.
- Keuangan:
  - Tagihan paket (bisa dicicil sampai 24 kali) dan tagihan bulanan massal. Tagihan ganda untuk pendaftaran dan periode yang sama ditolak.
  - Pembayaran sebagian dengan sisa dan tunggakan per cicilan, serta kuitansi siap cetak dengan terbilang.
  - Biaya, penerimaan lain, modal, prive, pinjaman, dan transfer dua sisi.
  - Kesalahan dikoreksi lewat pembalik, bukan dihapus.
  - Tutup bulan hanya bila saldo nyata setiap akun cocok, dan transaksi di bulan tertutup ditolak.
- Laporan keuangan: buku kas, laba rugi, neraca, aset & penyusutan, omzet & pajak, dan pemeriksaan antar laporan. Tersedia di layar, sebagai PDF (font tertanam), CSV, dan buku laporan tahunan PDF.
- Pendaftaran terpadu: **Siswa → Tambah siswa** menyimpan data siswa, program dan kelas, ketentuan biaya, serta tagihan pertama (paket bisa dicicil, atau bulanan) dalam satu isian. Bagian biaya hanya muncul untuk pemilik dan admin dengan akses **Catat**; tarif terisi dari tarif program dan hanya pemilik yang boleh mengubahnya. Bila penyimpanan biaya gagal, data siswa sudah aman dan cukup tekan Simpan lagi; siswa tidak tersimpan dua kali. Formulir yang sama dipakai untuk mendaftarkan siswa lama dari profilnya.
- **Pengaturan → Sistem** (pemilik): memeriksa konfigurasi dan kedua spreadsheet (tab dan header) tanpa menampilkan nilai rahasia, serta menampilkan email service account yang harus diberi akses. Pemeriksaan yang sama tersedia di terminal: `npm run cek:env`.
- **Panduan singkat** (`/panduan`, dari menu dan Akun saya): langkah harian sesuai peran akun, bisa dicetak.
- Hak akses diperiksa di server untuk setiap halaman dan setiap penyimpanan, bukan hanya disembunyikan di menu. Pengajar dan siswa tidak menerima angka keuangan sama sekali, termasuk di profil siswa.

## Coba cepat di komputer sendiri (tanpa Google Sheets)

Butuh Node.js 24. Jalankan dari folder `Project/garda-app`.

```bash
npm install
```

```bash
npm run dev:contoh -- --ulang
```

Perintah ini mengisi data contoh di `.data/lokal.json`: 12 siswa fiktif, 3 program, 4 kelas, 5 akun (`pemilik`, `admin.rina`, `pengajar.dimas`, `siswa.arif`, `wali.sari`), serta sesi 8 hari kerja terakhir dengan presensinya, satu sesi yang sedang berlangsung hari ini, nilai, tugas, pengukuran kesehatan, satu rapor terbit, serta pembukuan contoh (akun kas/bank, tarif, tagihan paket dan bulanan, pembayaran dengan tunggakan, biaya, transfer, dan dasar laporan). Password semua akun contoh ditampilkan **sekali** di layar. Isi variabel `CONTOH_PASSWORD` sebelum menjalankannya bila ingin menentukan password sendiri (minimal 14 karakter, berisi huruf dan angka).

```bash
npm run dev
```

Buka http://127.0.0.1:3020. Halaman masuk menampilkan **Masuk cepat**: klik salah satu akun contoh untuk masuk tanpa password. Isian username dan password tetap tersedia di bawahnya.

Masuk cepat hanya aktif bila `npm run dev` dijalankan dengan data lokal. Fitur ini otomatis mati di build produksi (`npm start`, Vercel) dan di mode Google Sheets. Isi `MASUK_CEPAT=0` untuk mematikannya saat development.

Di mode lokal, aplikasi menampilkan pita kuning "Mode lokal" di atas halaman. Secret sesi dibuat otomatis di `.data/`. Folder `.data/` diabaikan Git dan boleh dihapus kapan saja.

## Dari Fase 0 sampai aplikasi jalan dengan Google Sheets

### 1. Service account baru

1. Di [Google Cloud Console](https://console.cloud.google.com/), cabut kunci service account lama yang dulu dipakai aplikasi Presensi dan Laporan Keuangan: **IAM & Admin → Service Accounts → (akun lama) → Keys → hapus kuncinya**.
2. Buat service account baru, misalnya `ruang-garda`, lalu aktifkan **Google Sheets API** di proyek yang sama.
3. Buat kunci baru bertipe **JSON** dan simpan file itu **di luar** folder proyek, misalnya `C:\Users\<nama>\kunci\ruang-garda.json`. Jangan pernah memasukkan file kunci ke folder proyek atau mengirimnya lewat chat.

### 2. Tiga spreadsheet kosong

Buat tiga Google Spreadsheet kosong:

| Spreadsheet | Dipakai untuk |
| --- | --- |
| Ruang Garda — Inti & Akademik | Data nyata: akun, siswa, kelas, presensi, nilai, rapor |
| Ruang Garda — Keuangan | Data nyata keuangan. Bagikan hanya ke Owner. |
| Ruang Garda — Latihan | Uji coba dan pelatihan staf. Satu file ini menampung tab kedua spreadsheet di atas. |

Bagikan ketiganya ke **email service account** (berakhiran `iam.gserviceaccount.com`) sebagai **Editor**. ID spreadsheet adalah bagian alamat di antara `/d/` dan `/edit`.

### 3. Redis Upstash (opsional)

Lembaga memilih **murni spreadsheet**, jadi Redis tidak dipakai:

- Batas salah PIN/password disimpan di tab `Batas_Masuk`.
- Antrean penyimpanan berjalan di memori server.
- Konsekuensinya, jalankan aplikasi di **satu server**. Di layanan serverless yang memakai banyak instance, dua penyimpanan pada detik yang sama bisa saling menimpa.

Bila nanti ingin lebih aman untuk banyak pengguna bersamaan, buat Redis gratis di [Upstash](https://upstash.com/) lalu isi `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`. Data tetap hanya di spreadsheet.

### 4. Isi `.env.local`

Salin `.env.example` menjadi `.env.local` di folder `Project/garda-app`, lalu isi:

- `DATA_MODE=sheets`
- `GOOGLE_SERVICE_ACCOUNT_FILE` = alamat file kunci dari langkah 1, atau `GOOGLE_SERVICE_ACCOUNT_JSON` = isi file itu dalam satu baris
- `SHEET_ID_INTI` dan `SHEET_ID_KEUANGAN`. Untuk uji coba, isi **keduanya** dengan ID spreadsheet Latihan.
- `AUTH_SECRET` = teks acak minimal 32 karakter. Contoh pembuatannya ada di `.env.example`.
- `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` (opsional, boleh kosong)

File `.env.local` diabaikan Git. Jangan menyalinnya ke tempat lain. Periksa isiannya tanpa menampilkan nilai rahasia:

```bash
npm run cek:env
```

Baris bertanda ✗ wajib diperbaiki. Baris service account menampilkan email yang harus diberi akses Editor ke spreadsheet.

### 5. Buat tab dan header

```bash
npm run setup:sheets
```

Perintah di atas hanya pratinjau dan menampilkan tab yang akan dibuat. Bila sudah sesuai:

```bash
npm run setup:sheets -- --apply
```

Hasilnya: 15 tab di spreadsheet Inti dan 16 tab di spreadsheet Keuangan, masing-masing dengan baris judul berwarna hijau dan perlindungan peringatan. Perintah ini aman dijalankan berulang. Tab yang sudah ada tidak diubah dan tidak ada tab yang dihapus. Header yang tidak sesuai akan dilaporkan.

### 6. Buat akun Owner pertama

Jalankan di **PowerShell**. Di Git Bash, tanda kutip pada nama sering terpotong.

```bash
npm run buat-owner -- --username pemilik --nama "Nama Pemilik"
```

Password sementara tampil sekali di layar dan tidak disimpan di file mana pun. Perintah ini menolak berjalan bila sudah ada Owner aktif.

### 7. Jalankan

```bash
npm run dev
```

Masuk di http://127.0.0.1:3020 dengan akun Owner, lalu ganti password sementara. Password akun yang bisa membuka keuangan minimal 14 karakter. Setelah itu:

1. **Pengaturan → Sistem**: pastikan semua baris OK.
2. **Pengaturan → Lembaga**: periksa nama, kapasitas, dan acuan nilai.
3. **Pengaturan → Program & kelas**: buat program, lalu kelas.
4. **Keuangan**: tekan **Siapkan akun & kategori**, isi saldo awal di **Akun & periode**, lalu tarif setiap program di **Tarif & biaya**.
5. **Siswa → Tambah siswa**: data siswa, program, kelas, biaya, dan tagihan pertama sekaligus.
6. **Pengaturan → Akun**: buat akun staf, siswa, dan wali, lalu tautkan ke siswa atau kelas.

Urutan lengkap per peran ada di menu **Panduan singkat** di dalam aplikasi.

Bila semuanya lancar di spreadsheet Latihan, ganti `SHEET_ID_INTI` dan `SHEET_ID_KEUANGAN` ke spreadsheet asli, lalu ulangi langkah 5 dan 6.

## Akun siswa dengan PIN

- Setiap siswa otomatis punya akun saat ditambahkan (dari **Siswa → Tambah siswa** atau impor). Username-nya adalah **kode siswa**, misalnya `gan-0001`.
- **Masuk pertama:** siswa mengisi kode siswa, mengosongkan PIN, lalu menekan **Masuk**. Ia diarahkan ke halaman **Buat PIN** (6 angka, bukan angka sama semua atau berurutan), lalu langsung masuk.
- **Lupa PIN:** Owner membuka **Pengaturan → Akun →** akun siswa itu, lalu menekan **Reset PIN**. Siswa membuat PIN baru saat masuk berikutnya.
- **Ganti PIN:** dari **Akun saya**.

Untuk menambah banyak siswa sekaligus dari daftar nama (satu nama per baris, nomor urut boleh ikut):

```bash
npx tsx scripts/impor-siswa.ts daftar.txt --jalur TNI --perempuan 24
```

Perintah di atas hanya menampilkan pratinjau. Tambahkan `--terapkan` untuk menyimpan. Nama yang sudah ada dilewati.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Server pengembangan di http://127.0.0.1:3020 |
| `npm run check` | Pemeriksaan tipe dan seluruh tes |
| `npm test` | Tes saja |
| `npm run build` lalu `npm start` | Versi produksi di komputer sendiri. Wajib mengisi `AUTH_SECRET`; untuk data lokal juga `ALLOW_LOCAL_DATA=1`. |
| `npm run cek:env [-- --produksi]` | Periksa `.env.local` tanpa menampilkan rahasia; `--produksi` memakai syarat Vercel |
| `npm run setup:sheets [-- --apply]` | Pratinjau atau buat tab dan header |
| `npm run password-awal -- --username admin` | Pasang password awal `admin` untuk owner; wajib diganti saat masuk (aktivasi) |
| `npm run buat-owner -- --username … --nama "…"` | Akun Owner pertama |
| `npm run dev:contoh -- --ulang` | Isi ulang data contoh mode lokal |
| `npx tsx scripts/impor-siswa.ts <daftar.txt> --jalur TNI [--perempuan 3,7] [--terapkan]` | Impor banyak siswa sekaligus beserta akunnya |
| `npx tsx scripts/daftar-akun.ts` | Daftar akun (username, peran, status) tanpa hash password |

## Pengujian

`npm run check` menjalankan 236 tes otomatis:

- Tes Samapta: klasifikasi, IMT, Garjas B dan hasil akhir, durasi renang, simpan per pos tanpa menyentuh pos lain, kunci saat selesai, hak akses, serta pembantu tampilan
- presensi untuk semua siswa tanpa kelas dan hadir lewat QR yang langsung sah

- matriks hak akses untuk kelima peran, menu, dan aturan keuangan
- keunikan kode siswa, kapasitas, aturan pendaftaran, akun, dan tautan
- login, termasuk pesan gagal yang seragam dan batas percobaan per akun dan per IP
- pencabutan sesi saat password diganti, password sementara dibuat, peran diubah, akun dinonaktifkan, atau sesi dicabut
- koordinator penyimpanan: kirim ulang tidak menggandakan data, penyimpanan bersamaan tetap unik, tulis tidak pasti aman diulang, dan jejak operasi tanpa hash password
- skema spreadsheet dan validasi isian
- akademik, 25 tes yang dipindahkan dari skenario aplikasi Presensi lama:
  - pengajuan dan pengesahan presensi, alfa otomatis, sesi batal, peserta beku, toleransi terlambat
  - token QR dan hak pengajar per kelas
  - rata-rata nilai, acuan SKD, kesehatan, tugas
  - rapor terbit/revisi, siswa nonaktif
  - pengajuan dan penutupan sesi bersamaan, CSV aman dari rumus
- keuangan:
  - 82 dari 86 skenario aplikasi Keuangan lama dipindahkan apa adanya (`tests/keuangan/`). Isinya domain, laporan, PDF, buku tahunan, dan data tahunan contoh.
  - 4 skenario lainnya menguji infrastruktur lama (penolakan di Redis, migrasi Sheets, pemulihan perintah di browser), jadi ditulis ulang untuk infrastruktur Ruang Garda. Isinya penolakan tanpa jejak, gerbang sibuk, kirim ulang dengan ID sama, dan penyiapan spreadsheet Keuangan dengan API Google tiruan.
  - 12 tes jembatan dua spreadsheet: tarif dan ketentuan biaya tersimpan sebagai riwayat, tarif khusus hanya pemilik, data Inti tidak bisa diubah lewat keuangan, hak Lihat/Catat/pemilik, portal wali hanya berisi anak yang ditautkan, dan terbilang kuitansi.
- pendaftaran terpadu, 4 tes: siswa, pendaftaran, biaya, dan tagihan cicilan tersimpan dalam satu operasi; bila biaya gagal, siswa tetap tersimpan dan kirim ulang tidak menggandakannya; admin tanpa akses Catat ditolak sebelum ada yang tersimpan; tarif kosong ditolak sejak awal.
- masuk cepat, 3 tes: hanya aktif saat `npm run dev` dengan data lokal; mati di produksi (termasuk dengan `ALLOW_LOCAL_DATA=1`), di mode Google Sheets, saat tes, dan bila `MASUK_CEPAT=0`; akun nonaktif tidak ditampilkan.

Alur browser juga diuji dengan Playwright pada build produksi (data contoh lokal), dan semuanya lulus:

- Fase 1, 24 skenario: login, program/kelas/siswa, akun baru, ganti password wajib, cabut sesi, nonaktifkan akun, dan batasan admin.
- Fase 2, 30 skenario: QR presensi lewat login, tolak dan sahkan pengajuan, buat/buka/tutup sesi, catat izin, nilai SKD dan fisik, tugas, kesehatan, terbit dan revisi rapor dilihat wali, ekspor CSV, serta penolakan akses per peran.
- Fase 3, 26 skenario:
  - tagihan bulanan dan pengulangannya, pembayaran berlebih ditolak
  - pembayaran dan kuitansi berterbilang, koreksi pembayaran, penyesuaian tagihan
  - biaya, transfer, saldo kurang ditolak, akun baru
  - tutup bulan, transaksi di bulan tertutup ditolak, buka kembali
  - laba rugi, pemeriksaan antar laporan, PDF
  - batasan admin Lihat, serta wali hanya melihat tagihan dan kuitansi anaknya
- Fase 4, 17 skenario:
  - pendaftaran terpadu dengan tagihan 3 cicilan, siswa tanpa program, dan pendaftaran dari profil tanpa biaya
  - admin tanpa akses Catat tidak melihat isian biaya
  - tidak ada angka keuangan di halaman pengajar dan siswa (PRD §9)
  - pengajar tidak bisa membuka siswa di luar kelasnya
  - status sistem hanya untuk pemilik, dan panduan sesuai peran

Skrip uji browser itu belum dimasukkan ke folder ini.

## Keamanan

- Rahasia hanya ada di environment variable atau `.env.local`. File kunci JSON, `.env*`, `.data/`, dan `backups/` diabaikan Git.
- Password disimpan sebagai hash scrypt. Pesan login gagal selalu sama, tidak membedakan username yang ada dan tidak ada.
- Sesi berupa cookie bertanda tangan (HttpOnly, SameSite=Lax, Secure di produksi) yang berlaku 8 jam. Sesi gugur bila akun dinonaktifkan atau `versi_otorisasi` naik.
- Percobaan login dibatasi 5 kali per akun dan 25 kali per IP dalam 15 menit.
- Header keamanan aktif: CSP dengan nonce per request, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, dan HSTS di produksi. Server Actions memeriksa asal permintaan.
- Setiap perubahan tercatat di tab `Operasi` (siapa, kapan, sebelum/sesudah) tanpa hash password atau password sementara. Baris data tidak pernah dihapus; data dinonaktifkan lewat kolom `aktif`.

## Struktur kode

```
src/
  app/                 halaman (App Router) dan Server Actions (app/actions)
    (ruang)/           halaman setelah masuk: beranda, siswa, pengaturan (termasuk sistem), akademik (jadwal, sesi, nilai, tugas, kesehatan, rapor, ekspor CSV), keuangan, panduan, akun-saya, menu
    masuk/, ganti-password/, qr-presensi/
  components/          kerangka (menu samping/bawah), navigasi, form, komponen tampilan, dan dashboard Beranda
  lib/
    auth/              password, token sesi, token QR, login, penentuan pengguna dari sesi
    core/              peran & tipe, matriks hak akses, validasi, perintah domain (akademik.ts; terpadu.ts untuk pendaftaran terpadu)
    keuangan/          logika Keuangan lama (domain, laporan, PDF) + jembatan dua spreadsheet (sumber.ts) + aset font/logo PDF
    data/              skema tab, penyimpanan Sheets & lokal, gerbang/batas masuk (Redis atau spreadsheet), koordinator penulisan
    server/            sesi Next.js, pembacaan data per halaman, pembantu Server Action
  proxy.ts             CSP dengan nonce per request
scripts/               setup-sheets, buat-owner, cek-env, isi-contoh-lokal
tests/                 tes node:test (memakai penyimpanan palsu di memori)
docs/tangkapan-layar/  tangkapan layar desktop & ponsel, terang & gelap
```

## Tangkapan layar

Ada di [docs/tangkapan-layar](docs/tangkapan-layar), dengan nama `{desktop|ponsel}-{terang|gelap}-{halaman}.png`. Misalnya:

- [Masuk (desktop, terang)](docs/tangkapan-layar/desktop-terang-masuk.png)
- [Beranda Owner (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-beranda.png)
- [Daftar siswa (desktop, gelap)](docs/tangkapan-layar/desktop-gelap-owner-siswa.png)
- [Beranda Pengajar (ponsel, terang)](docs/tangkapan-layar/ponsel-terang-pengajar-beranda.png)
- [Beranda Wali (ponsel, gelap)](docs/tangkapan-layar/ponsel-gelap-wali-beranda.png)
- [Sesi berlangsung dengan QR (desktop, terang)](docs/tangkapan-layar/desktop-terang-pengajar-sesi-qr.png)
- [Jadwal & presensi (desktop, gelap)](docs/tangkapan-layar/desktop-gelap-owner-jadwal.png)
- [Nilai & tes (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-nilai.png)
- [Rapor terbit (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-rapor.png)
- [Presensi siswa (ponsel, gelap)](docs/tangkapan-layar/ponsel-gelap-siswa-presensi.png)
- [Rapor dilihat wali (ponsel, terang)](docs/tangkapan-layar/ponsel-terang-wali-rapor.png)
- [Ringkasan keuangan (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-keuangan.png)
- [Rincian tagihan cicilan (desktop, gelap)](docs/tangkapan-layar/desktop-gelap-owner-tagihan.png)
- [Laba rugi (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-laporan-keuangan.png)
- [Tagihan anak (ponsel, gelap)](docs/tangkapan-layar/ponsel-gelap-wali-tagihan.png)
- [Kuitansi (desktop, terang)](docs/tangkapan-layar/desktop-terang-wali-kuitansi.png)
- [Tambah siswa terpadu (desktop, gelap)](docs/tangkapan-layar/desktop-gelap-owner-siswa-baru-terpadu.png)
- [Status sistem (desktop, terang)](docs/tangkapan-layar/desktop-terang-owner-status-sistem.png)
- [Panduan pengajar (ponsel, terang)](docs/tangkapan-layar/ponsel-terang-pengajar-panduan.png)

## Catatan perubahan struktur data

Keuangan memakai spreadsheet Keuangan dengan kolom yang sama seperti aplikasi Keuangan lama versi 2:

- Siswa, program, pendaftaran, dan akun pengguna dibaca dari spreadsheet Inti, tidak disalin.
- Angka biaya disimpan sebagai riwayat di `Tarif_Program` dan `Ketentuan_Biaya`.
- Tagihan hanya bisa diterbitkan setelah ketentuan biaya pendaftaran diatur di menu **Keuangan → Tarif & biaya**.
- Langkah pertama pemilik adalah menekan **Siapkan akun & kategori** di Ringkasan Keuangan, lalu mengisi saldo awal di **Akun & periode**.

17 Nov 2026 menambah tab `Tes_Samapta` dan `Hasil_Samapta` serta kolom `tempat_lahir` dan `asal_sekolah` di ujung kanan tab `Siswa`. `npm run setup:sheets -- --apply` membuat tab baru dan melengkapi header lama yang hanya kekurangan kolom di ujung kanan, tanpa mengubah data.

Fase 2 menambah kolom `komponen` (sesudah `kategori`) di tab `Hasil_Tes`. Bila tab itu sudah dibuat sebelum Fase 2 dan masih kosong, hapus tab `Hasil_Tes` lalu jalankan `npm run setup:sheets -- --apply` lagi. Bila sudah berisi data, sisipkan kolom `komponen` secara manual di posisi yang sama.

## Deploy ke Vercel (setelah Fase 0, dengan persetujuan pemilik)

**Belum dilakukan.** Membuat repositori GitHub, `git push`, dan deploy hanya dijalankan setelah pemilik setuju. Urutannya:

1. **Siapkan di komputer sendiri.** Isi `.env.local` dengan ID spreadsheet Latihan untuk `SHEET_ID_INTI` dan `SHEET_ID_KEUANGAN`, lalu jalankan:

   ```bash
   npm run cek:env -- --produksi
   ```

   Lanjutkan hanya bila tidak ada ✗. Setelah itu buat tab dan akun Owner:

   ```bash
   npm run setup:sheets -- --apply
   ```

   ```bash
   npm run buat-owner -- --username pemilik --nama "Nama Pemilik"
   ```

2. **Pastikan lolos pemeriksaan:**

   ```bash
   npm run check
   ```

   ```bash
   npm run build
   ```

3. **Repositori privat.** Buat repositori GitHub **privat**, lalu push folder `garda-app`. Periksa dulu bahwa `.env.local`, `.data/`, dan file kunci JSON tidak ikut (semuanya sudah ada di `.gitignore`).

4. **Proyek Vercel.** Impor repositori itu dengan framework Next.js dan Node.js 24. Isi **Environment Variables** untuk Production:

   | Nama | Isi |
   | --- | --- |
   | `DATA_MODE` | `sheets` |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | isi file kunci JSON dalam satu baris (`…_FILE` tidak berlaku di Vercel) |
   | `SHEET_ID_INTI`, `SHEET_ID_KEUANGAN` | ID spreadsheet Latihan dulu, nanti diganti ke yang asli |
   | `AUTH_SECRET` | secret acak baru minimal 32 karakter, berbeda dari milik komputer sendiri |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **kosongkan** untuk murni spreadsheet (pilihan lembaga); batas salah PIN disimpan di tab `Batas_Masuk` |
   | `APP_TIMEZONE` | `Asia/Jakarta` |

   Jangan isi `ALLOW_LOCAL_DATA` di Vercel. Murni spreadsheet tetap aman untuk skala lembaga:
   - penyimpanan hanya menulis sel yang berubah, jadi dua perubahan pada baris yang sama tetapi kolom berbeda tidak saling menimpa;
   - baris hasil samapta disiapkan saat tes dibuat, jadi beberapa HP yang mengisi pos bersamaan tidak membuat baris ganda.

   Yang masih bisa bertabrakan hanya dua perubahan pada **sel yang sama** di detik yang sama.

5. **Subdomain.** Di Vercel → **Settings → Domains**, tambahkan misalnya `ruang.gardaabdinegara.com`. Di pengelola DNS domain, buat record **CNAME** sesuai petunjuk Vercel. Setelah sertifikat HTTPS aktif, buka subdomain itu.

6. **Periksa setelah deploy.** Masuk sebagai Owner (`admin`, password awal `admin`), lalu langsung ganti password saat diminta (aktivasi). Password awal bisa dipasang ulang kapan saja dengan `npm run password-awal -- --username admin`. Setelah itu buka **Pengaturan → Sistem**. Semua baris harus OK dan badge menunjukkan **Siap dipakai**.

7. **Latihan dulu, lalu data nyata.**
   - Latih staf di spreadsheet Latihan dengan bantuan **Panduan singkat**.
   - Setelah itu, ganti `SHEET_ID_INTI` dan `SHEET_ID_KEUANGAN` di Vercel ke spreadsheet asli, lalu deploy ulang.
   - Dari komputer sendiri, arahkan `.env.local` ke ID asli, lalu jalankan `npm run setup:sheets -- --apply` dan `npm run buat-owner` untuk spreadsheet asli.
   - Mulai uji coba terbatas, misalnya satu kelas selama satu bulan, sebelum dipakai seluruh lembaga.

Setiap kali isi environment variable berubah, deploy ulang agar nilainya terbaca.

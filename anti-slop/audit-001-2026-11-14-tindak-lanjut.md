# Tindak lanjut audit 001

Tanggal: 14 November 2026
Mode: AFTER (pilihan sesi ini)

Nomor yang disetujui pemilik: **2, 3, 4, 5, 6, 7** (nomor 1 dikerjakan berikutnya). Nomor lain tidak disentuh.

## Yang diperbaiki

| No | Aturan | Perbaikan | Berkas |
| --- | --- | --- | --- |
| 2 | R-25 | Warna teks redup, bahaya, peringatan, dan sukses di mode terang digelapkan sedikit. Semua pasangan lulus 4,5:1. | `src/app/globals.css` (token `:root`) |
| 3 | R-02 | Semua em dash di teks antarmuka diganti. Nilai kosong memakai "-". Pilihan kosong memakai kata ("Tidak dipilih", "Tanpa program", "Daftarkan nanti"). Pemisah memakai "·" atau titik dua. | 19 berkas di `src` |
| 4 | R-27 | Tampilan memuat baru untuk semua halaman setelah masuk. Menu tetap terlihat, isi halaman menjadi kartu "Memuat halaman" dengan keterangan. | `src/app/(ruang)/loading.tsx`, `globals.css` |
| 5 | R-03 | Target sentuh minimal 44 px di ponsel dan perangkat sentuh. Tautan teks diberi area sentuh tambahan tanpa menggeser tata letak. | `globals.css` |
| 6 | R-03 | Baris tab dibungkus ke baris berikutnya, tidak lagi digulir ke samping. Tidak ada tab yang terpotong, dan scrollbar abu-abu hilang. | `globals.css` (`.tabs`) |
| 7 | R-39 | Kursor tangan untuk semua kontrol aktif, dan `not-allowed` untuk yang nonaktif. Hover (latar dan garis tepi, tautan bergaris bawah) untuk tab, Pekerjaan cepat, chip akun, tombol ikon, dan menu bawah. State tekan (`:active`): kontrol turun 1 px dan latarnya berubah. | `globals.css` |

### Rincian nomor 2

| Pasangan | Sebelum | Sesudah |
| --- | --- | --- |
| Badge bahaya | `#ac634b` di atas `#faece4`, 3,92:1 | `#985340`, 4,99:1 |
| Badge peringatan, pita Mode lokal | `#8a6a2c` di atas `#f7f0da`, 4,41:1 | `#7d5f24`, 5,21:1 |
| Badge sukses | `#3e7958` di atas `#e7f1e2`, 4,43:1 | `#376e50`, 5,15:1 |
| Teks redup di latar lembut | `#63725f` di atas `#eff1e7`, 4,49:1 | `#5c6b58`, 4,98:1 |

Mode gelap tidak diubah karena sudah lulus.

### Rincian nomor 4

Gerakan di tampilan memuat:

- Kartu muncul setelah jeda 0,3 detik, supaya tidak berkedip bila halaman cepat dimuat.
- Garis bergerak paling lama 4 putaran (sekitar 5 detik), lalu diam.
- Dengan `prefers-reduced-motion`, tidak ada gerakan sama sekali.

## Bukti (diperiksa di pratinjau lokal, `npm run dev`)

- `npm run check`: tipe lulus, 188 dari 188 tes lulus.
- **Beranda, ponsel (lebar 414):**
  - Tidak ada kontrol di bawah 44 px. Contoh ukuran: tombol tema 44 × 44, "Jadwal" 79 × 44, "Buka" 65 × 44, "Buka tugas" 61 × 45, nama siswa 93 × 45, logo beranda 163 × 44.
  - Tidak ada gulir ke samping.
  - Tidak ada em dash di teks halaman.
- **Pengaturan → Akun, ponsel (lebar 375):**
  - Kedua baris tab (4 dan 6 tab) terbungkus tanpa luapan. Tidak ada tab yang keluar layar, dan setiap tab setinggi 44 px.
- **Keuangan, desktop:**
  - Hover pada tab "Tagihan": latar menjadi `#eff1e7`, garis tepi `#5e715e`, kursor tangan.
  - Hover pada nama siswa: bergaris bawah dan hijau.
  - Klik tab "Tagihan" membuka `/keuangan/tagihan`.
- **Badge "63%" di Beranda:** warna terhitung `rgb(152, 83, 64)` di atas `rgb(250, 236, 228)`.
- **Tampilan memuat:** markup yang sama ditampilkan di halaman untuk dilihat bentuknya. Kartu, garis gerak, dan keterangannya tampil di bawah menu.
  - Batasnya: di mode lokal halaman dimuat terlalu cepat untuk melihat tampilan ini secara alami. Ia akan terlihat saat memakai Google Sheets.
- **Konsol dan server:** tidak ada error. Satu-satunya pesan berasal dari alat bantu pengembangan Next.js (CSP), yang sudah ada sebelumnya.

## Pemeriksaan Delivery Gate untuk nomor yang disetujui

| Aturan | Status | Bukti |
| --- | --- | --- |
| R-02 | PASS | Pencarian em dash di `src` di luar komentar: 0 hasil. |
| R-03 | PASS | Semua target ≥ 44 px di ponsel; tab terbungkus; tidak ada luapan. |
| R-25 | PASS | Semua pasangan yang gagal kini 4,98:1 sampai 5,21:1. |
| R-27 | PASS | Tampilan memuat ditambahkan. Tampilan galat dan kosong sudah ada sebelumnya. |
| R-33 | PASS | Perubahan ditulis langsung di berkas sumber. Tidak ada skrip penambal. |
| R-35 | PASS | Dijalankan dengan `npm run dev` dan diklik seperti tercatat di bagian Bukti. |
| R-39 | PASS | Kursor, hover, active, dan disabled tersedia untuk kontrol yang diaudit. |

## Masih terbuka (belum disetujui atau menunggu)

- **Nomor 1 (R-37):** `DESIGN.md` sedang disusun bersama pemilik.
- **Nomor 8 sampai 17:** belum disentuh.

Karena nomor 1 dan 8 sampai 17 masih terbuka, Delivery Gate penuh (blok Liveliness dan identitas) **belum lulus**. Beranda masih berstatus perbaikan aksesibilitas, belum desain akhir.

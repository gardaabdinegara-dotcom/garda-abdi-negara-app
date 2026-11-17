// Tampil selama halaman setelah masuk sedang mengambil data (antislop R-27).
// Kerangka (menu atas/bawah) tetap terlihat; hanya isi halaman yang diganti.
export default function Loading() {
  return (
    <div className="page">
      <div className="loading-state" role="status" aria-live="polite">
        <span className="loading-bar" aria-hidden="true" />
        <p>
          <b>Memuat halaman</b>
          <span>Mengambil data terbaru dari spreadsheet lembaga.</span>
        </p>
      </div>
    </div>
  );
}

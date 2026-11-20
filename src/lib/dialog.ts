// Membuka <dialog> sebagai modal dengan fokus awal di dialog itu sendiri.
// Tanpa ini browser (terutama Safari iPhone) memfokuskan tombol pertama, biasanya "Tutup",
// sehingga cincin fokus tebal muncul di tombol itu begitu lembar dibuka.
export function bukaDialog(dialog: HTMLDialogElement | null | undefined): void {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
  dialog.focus({ preventScroll: true });
}

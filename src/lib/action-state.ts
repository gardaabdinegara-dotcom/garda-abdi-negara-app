/** Hasil Server Action yang ditampilkan form (dipakai di server dan klien). */
export interface ActionState {
  ok: boolean;
  message: string;
  errors?: Record<string, string>;
  /** Nilai sekali tampil, mis. password sementara. */
  secret?: string;
  /** Penanda waktu agar form tahu ada hasil baru. */
  at?: number;
}

export const initialActionState: ActionState = { ok: false, message: "" };

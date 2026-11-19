"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, useState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { UJI_SISWA_FIELD } from "@/lib/core/uji-siswa";
import { useUjiSiswaId } from "./uji-siswa-context";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

const FormContext = createContext<{ errors: Record<string, string>; pending: boolean }>({ errors: {}, pending: false });

/**
 * Form yang menjalankan Server Action dan menampilkan hasilnya.
 * - `operationId` dibuat di server dan diperbarui setelah berhasil, sehingga kirim ulang
 *   setelah gangguan jaringan tidak menyimpan data dua kali.
 * - Isian tidak dikosongkan saat ada kesalahan; `resetOnSuccess` mengosongkan form setelah berhasil.
 */
export function ActionForm({
  action,
  operationId,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  feedback = true,
}: {
  action: ServerAction;
  operationId?: string;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  feedback?: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, initialActionState);
  const testId = useUjiSiswaId();
  const [opId, setOpId] = useState(operationId);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.at || state.at === handled.current) return;
    handled.current = state.at;
    if (!state.ok) return;
    if (operationId) setOpId(crypto.randomUUID());
    if (resetOnSuccess) formRef.current?.reset();
  }, [state, operationId, resetOnSuccess]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  }

  return (
    <FormContext value={{ errors: state.errors ?? {}, pending }}>
      <form ref={formRef} method="post" className={className} onSubmit={onSubmit} noValidate>
        {opId ? <input type="hidden" name="operation_id" value={opId} /> : null}
        {testId ? <input type="hidden" name={UJI_SISWA_FIELD} value={testId} /> : null}
        {children}
        {feedback ? <Feedback state={state} /> : null}
      </form>
    </FormContext>
  );
}

function Feedback({ state }: { state: ActionState }) {
  const [copied, setCopied] = useState(false);
  if (!state.message) return null;
  return (
    <div className="stack" aria-live="polite">
      <p className={`notice ${state.ok ? "notice-success" : "notice-danger"}`} role={state.ok ? "status" : "alert"}>
        {state.message}
      </p>
      {state.ok && state.secret ? (
        <div className="secret">
          <span className="field-label">Hanya ditampilkan sekali</span>
          <code>{state.secret}</code>
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const password = state.secret!.split(" · ").pop() ?? state.secret!;
                navigator.clipboard?.writeText(password).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Tersalin" : "Salin password"}
            </button>
            <span className="hint muted">Kirim lewat jalur pribadi, jangan di grup.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useFieldError(name: string) {
  return useContext(FormContext).errors[name];
}

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "password" | "date" | "time" | "month" | "number" | "tel" | "url" | "search" | "textarea" | "select";
  defaultValue?: string | number;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel";
  pattern?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: string;
  options?: { value: string; label: string }[];
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function Field({ label, name, type = "text", hint, options, className, required, ...rest }: FieldProps) {
  const id = useId();
  const error = useFieldError(name);
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    name,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    defaultValue: rest.defaultValue,
    disabled: rest.disabled,
    autoFocus: rest.autoFocus,
  };
  let control: React.ReactNode;
  if (type === "select") {
    control = (
      <select {...common}>
        {(options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea {...common} placeholder={rest.placeholder} rows={3} />;
  } else {
    control = (
      <input
        {...common}
        type={type}
        placeholder={rest.placeholder}
        autoComplete={rest.autoComplete}
        inputMode={rest.inputMode}
        pattern={rest.pattern}
        maxLength={rest.maxLength}
        min={rest.min}
        max={rest.max}
        step={rest.step ?? (type === "number" ? "any" : undefined)}
      />
    );
  }
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="muted"> *</span> : null}
      </label>
      {control}
      {hint ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CheckField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  const error = useFieldError(name);
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} />
        {label}
      </label>
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size,
  name,
  value,
  pendingLabel = "Menyimpan…",
  block,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm";
  name?: string;
  value?: string;
  pendingLabel?: string;
  block?: boolean;
}) {
  const { pending } = useContext(FormContext);
  const classes = ["btn", variant !== "primary" ? `btn-${variant}` : "", size ? `btn-${size}` : "", block ? "btn-block" : ""].filter(Boolean).join(" ");
  return (
    <button type="submit" className={classes} name={name} value={value} disabled={pending} aria-busy={pending || undefined}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Pilihan program lalu kelas; daftar kelas menyesuaikan program yang dipilih. */
export function ProgramClassPicker({
  programs,
  classes,
  defaultProgram,
}: {
  programs: { program_id: string; nama_program: string }[];
  classes: { kelas_id: string; nama_kelas: string; program_id: string }[];
  defaultProgram?: string;
}) {
  const [program, setProgram] = useState(defaultProgram ?? programs[0]?.program_id ?? "");
  const programError = useFieldError("program_id");
  const classError = useFieldError("kelas_id");
  const available = classes.filter((c) => c.program_id === program);
  const programId = useId();
  const classId = useId();
  return (
    <>
      <div className="field">
        <label htmlFor={programId}>Program</label>
        <select id={programId} name="program_id" value={program} onChange={(e) => setProgram(e.target.value)} aria-invalid={programError ? true : undefined}>
          {programs.map((p) => (
            <option key={p.program_id} value={p.program_id}>
              {p.nama_program}
            </option>
          ))}
        </select>
        {programError ? <span className="field-error">{programError}</span> : null}
      </div>
      <div className="field">
        <label htmlFor={classId}>Kelas</label>
        <select id={classId} name="kelas_id" key={program} aria-invalid={classError ? true : undefined} disabled={available.length === 0}>
          {available.length === 0 ? <option value="">Belum ada kelas aktif di program ini</option> : null}
          {available.map((c) => (
            <option key={c.kelas_id} value={c.kelas_id}>
              {c.nama_kelas}
            </option>
          ))}
        </select>
        {classError ? <span className="field-error">{classError}</span> : null}
      </div>
    </>
  );
}

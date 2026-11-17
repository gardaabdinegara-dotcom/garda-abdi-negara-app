import Link from "next/link";
import { ENROLLMENT_LABEL, ROLE_LABEL, type EnrollmentStatus, type Role } from "@/lib/core/types";
import { Icon, type IconName } from "./icon";

export function PageHead({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="page-head">
      <div>
        {back ? (
          <p className="crumbs">
            <Link href={back.href}>← {back.label}</Link>
          </p>
        ) : null}
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge${tone === "neutral" ? "" : ` badge-${tone}`}`}>{children}</span>;
}

export function ActiveBadge({ active, on = "Aktif", off = "Nonaktif" }: { active: boolean; on?: string; off?: string }) {
  return <Badge tone={active ? "success" : "danger"}>{active ? on : off}</Badge>;
}

const ROLE_TONE: Record<Role, Tone> = { OWNER: "warning", ADMIN: "info", PENGAJAR: "success", SISWA: "neutral", WALI: "neutral" };
export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>;
}

const ENROLLMENT_TONE: Record<EnrollmentStatus, Tone> = { AKTIF: "success", CUTI: "warning", SELESAI: "info", BERHENTI: "danger" };
export function EnrollmentBadge({ status }: { status: EnrollmentStatus }) {
  return <Badge tone={ENROLLMENT_TONE[status]}>{ENROLLMENT_LABEL[status]}</Badge>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Tabs({ items, current, label }: { items: { key: string; href: string; label: string }[]; current: string; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <Link key={item.key} href={item.href} className="tab" aria-current={item.key === current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  return <p className={`notice notice-${tone}`}>{children}</p>;
}

/** Kartu fitur yang belum dibangun pada fase ini. */
export function ComingSoon({ icon, title, phase, children }: { icon: IconName; title: string; phase: string; children: React.ReactNode }) {
  return (
    <section className="card soon">
      <div className="card-head">
        <div className="row">
          <span className="avatar">
            <Icon name={icon} />
          </span>
          <h2>{title}</h2>
        </div>
        <Badge>{phase}</Badge>
      </div>
      <p className="muted">{children}</p>
    </section>
  );
}

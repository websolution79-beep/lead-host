"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleUserRound,
  Copy,
  KeyRound,
  LockKeyhole,
  MailPlus,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { createPublicSupabaseClient } from "@/lib/supabase/client";
import { AdminTeamCompensationSettings } from "@/components/admin-team-compensation-settings";

type AccessLevel = "read" | "write";

type TeamPermission = {
  key: string;
  section: string;
  label: string;
  description: string;
  supports_write: boolean;
  sort_order: number;
};

type RolePermission = {
  key: string;
  accessLevel: AccessLevel;
};

type TeamRole = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  permissions: RolePermission[];
};

type TeamMember = {
  id: string;
  profile_id: string;
  role_id: string;
  status: "invited" | "active" | "suspended";
  creation_mode: "invite" | "manual";
  must_change_password: boolean;
  badge_color: string;
  whatsapp_number: string | null;
  telegram_contact: string | null;
  contact_email: string | null;
  paypal_email: string | null;
  invited_at: string | null;
  joined_at: string | null;
  created_at: string;
  profile: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    status: "active" | "suspended";
    created_at: string;
  } | null;
  role: TeamRole | null;
};

type TeamResponse = {
  permissions: TeamPermission[];
  roles: TeamRole[];
  members: TeamMember[];
  error?: string;
};

type RoleDraft = {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  permissions: Record<string, "none" | AccessLevel>;
};

type MemberDraft = {
  mode: "invite" | "manual";
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  password: string;
};

const emptyMemberDraft: MemberDraft = {
  mode: "invite",
  firstName: "",
  lastName: "",
  email: "",
  roleId: "",
  password: "",
};

export function AdminTeamConsole() {
  const supabase = useMemo(() => createPublicSupabaseClient(), []);
  const [permissions, setPermissions] = useState<TeamPermission[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activeTab, setActiveTab] = useState<
    "members" | "roles" | "compensation-settings"
  >("members");
  const [roleDraft, setRoleDraft] = useState<RoleDraft | null>(null);
  const [memberDraft, setMemberDraft] = useState<MemberDraft | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editMemberFirstName, setEditMemberFirstName] = useState("");
  const [editMemberLastName, setEditMemberLastName] = useState("");
  const [editMemberRoleId, setEditMemberRoleId] = useState("");
  const [editMemberBadgeColor, setEditMemberBadgeColor] = useState("#2563EB");
  const [editMemberWhatsappNumber, setEditMemberWhatsappNumber] = useState("");
  const [editMemberTelegramContact, setEditMemberTelegramContact] = useState("");
  const [editMemberContactEmail, setEditMemberContactEmail] = useState("");
  const [editMemberPaypalEmail, setEditMemberPaypalEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [supabase]);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = await getToken();

    if (!token) {
      setError("Sessione Super Admin non disponibile.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/admin/team", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const payload = (await response.json()) as TeamResponse;

    if (!response.ok) {
      setError(payload.error ?? "Non riesco a caricare il Team.");
    } else {
      setPermissions(payload.permissions);
      setRoles(payload.roles);
      setMembers(payload.members);
    }
    setLoading(false);
  }, [getToken]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadTeam(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTeam]);

  const activeRoles = roles.filter((role) => role.is_active);
  const activeMembers = members.filter((member) => member.status === "active").length;
  const invitedMembers = members.filter((member) => member.status === "invited").length;
  const suspendedMembers = members.filter(
    (member) => member.status === "suspended",
  ).length;

  function openNewRole() {
    setRoleDraft({
      name: "",
      description: "",
      isActive: true,
      permissions: Object.fromEntries(
        permissions.map((permission) => [permission.key, "none"]),
      ),
    });
  }

  function openRole(role: TeamRole) {
    const rolePermissions = Object.fromEntries(
      permissions.map((permission) => [permission.key, "none"]),
    ) as RoleDraft["permissions"];

    for (const permission of role.permissions) {
      rolePermissions[permission.key] = permission.accessLevel;
    }

    setRoleDraft({
      id: role.id,
      name: role.name,
      description: role.description ?? "",
      isActive: role.is_active,
      permissions: rolePermissions,
    });
  }

  function openMemberCreation() {
    setMemberDraft({
      ...emptyMemberDraft,
      roleId: activeRoles[0]?.id ?? "",
    });
  }

  function openMemberEdit(member: TeamMember) {
    setEditingMember(member);
    setEditMemberFirstName(member.profile?.first_name ?? "");
    setEditMemberLastName(member.profile?.last_name ?? "");
    setEditMemberRoleId(member.role_id);
    setEditMemberBadgeColor(member.badge_color ?? "#2563EB");
    setEditMemberWhatsappNumber(member.whatsapp_number ?? "");
    setEditMemberTelegramContact(member.telegram_contact ?? "");
    setEditMemberContactEmail(member.contact_email ?? "");
    setEditMemberPaypalEmail(member.paypal_email ?? "");
  }

  async function request(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    const token = await getToken();

    if (!token) {
      throw new Error("Sessione Super Admin non disponibile.");
    }

    const response = await fetch("/api/admin/team", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      delivery?: "invite" | "password_setup";
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Operazione Team non riuscita.");
    }

    return payload;
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleDraft) return;

    const selectedPermissions = Object.entries(roleDraft.permissions)
      .filter((entry): entry is [string, AccessLevel] => entry[1] !== "none")
      .map(([key, accessLevel]) => ({ key, accessLevel }));

    if (!selectedPermissions.length) {
      setError("Assegna almeno un permesso al ruolo.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await request(roleDraft.id ? "PATCH" : "POST", {
        action: roleDraft.id ? "update_role" : "create_role",
        ...(roleDraft.id ? { roleId: roleDraft.id } : {}),
        role: {
          name: roleDraft.name,
          description: roleDraft.description || null,
          isActive: roleDraft.isActive,
          permissions: selectedPermissions,
        },
      });
      setRoleDraft(null);
      setSuccess(roleDraft.id ? "Ruolo aggiornato." : "Ruolo creato.");
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile salvare il ruolo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole(role: TeamRole) {
    if (
      !window.confirm(
        `Eliminare definitivamente il ruolo "${role.name}"? L'operazione è possibile solo se non è assegnato a membri.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await request("DELETE", { action: "delete_role", roleId: role.id });
      setSuccess("Ruolo eliminato.");
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile eliminare il ruolo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberDraft) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await request("POST", {
        action:
          memberDraft.mode === "invite" ? "invite_member" : "create_member",
        member: {
          firstName: memberDraft.firstName,
          lastName: memberDraft.lastName,
          email: memberDraft.email,
          roleId: memberDraft.roleId,
          ...(memberDraft.mode === "manual"
            ? { password: memberDraft.password }
            : {}),
        },
      });
      setMemberDraft(null);
      setSuccess(
        memberDraft.mode === "invite"
          ? "Invito inviato al nuovo membro."
          : "Membro creato. Dovrà cambiare la password al primo accesso.",
      );
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile aggiungere il membro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingMember) return;

    setSaving(true);
    setError("");

    try {
      await request("PATCH", {
        action: "update_member",
        memberId: editingMember.id,
        firstName: editMemberFirstName,
        lastName: editMemberLastName,
        roleId: editMemberRoleId,
        status: editingMember.status === "suspended" ? "suspended" : "active",
        badgeColor: editMemberBadgeColor,
        whatsappNumber: editMemberWhatsappNumber,
        telegramContact: editMemberTelegramContact,
        contactEmail: editMemberContactEmail,
        paypalEmail: editMemberPaypalEmail,
      });
      setEditingMember(null);
      setSuccess("Membro Team aggiornato.");
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile aggiornare il membro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleMemberStatus(member: TeamMember) {
    const nextStatus = member.status === "suspended" ? "active" : "suspended";
    const verb = nextStatus === "suspended" ? "sospendere" : "riattivare";

    if (
      !window.confirm(
        `Vuoi ${verb} ${memberName(member)}? ${
          nextStatus === "suspended"
            ? "Non potrà più accedere all'area amministrativa."
            : "Tornerà ad avere i permessi del ruolo assegnato."
        }`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await request("PATCH", {
        action: "update_member",
        memberId: member.id,
        firstName: member.profile?.first_name ?? "Membro",
        lastName: member.profile?.last_name ?? "Team",
        roleId: member.role_id,
        status: nextStatus,
        badgeColor: member.badge_color ?? "#2563EB",
        whatsappNumber: member.whatsapp_number ?? "",
        telegramContact: member.telegram_contact ?? "",
        contactEmail: member.contact_email ?? "",
        paypalEmail: member.paypal_email ?? "",
      });
      setEditingMember(null);
      setSuccess(
        nextStatus === "suspended"
          ? "Membro sospeso."
          : "Membro riattivato.",
      );
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile aggiornare il membro.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resendMemberInvite(member: TeamMember) {
    if (member.status !== "invited") return;

    const email = member.profile?.email ?? "questo membro";
    if (!window.confirm(`Reinviare l'invito a ${email}?`)) {
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result = await request("POST", {
        action: "resend_invite",
        memberId: member.id,
      });
      setSuccess(
        result.delivery === "password_setup"
          ? `Email per impostare la password inviata a ${email}.`
          : `Nuovo invito inviato a ${email}.`,
      );
      await loadTeam();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Non è stato possibile reinviare l'invito.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card flex min-h-64 items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw className="mx-auto animate-spin text-green" size={28} />
          <p className="mt-3 text-sm font-semibold text-muted">
            Caricamento Team...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Membri totali" value={members.length} icon={UsersRound} />
        <KpiCard label="Attivi" value={activeMembers} icon={ShieldCheck} />
        <KpiCard label="Inviti in attesa" value={invitedMembers} icon={MailPlus} />
        <KpiCard label="Sospesi" value={suspendedMembers} icon={LockKeyhole} />
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          <Check size={17} />
          {success}
        </div>
      ) : null}

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Controllo accessi</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              Membri e ruoli
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={openNewRole}
            >
              <Plus size={17} />
              Nuovo ruolo
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={openMemberCreation}
              disabled={!activeRoles.length}
              title={
                activeRoles.length
                  ? "Aggiungi un membro"
                  : "Crea prima un ruolo attivo"
              }
            >
              <UserPlus size={17} />
              Aggiungi membro
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 px-5 pt-4">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <TabButton
              active={activeTab === "members"}
              onClick={() => setActiveTab("members")}
            >
              Membri ({members.length})
            </TabButton>
            <TabButton
              active={activeTab === "roles"}
              onClick={() => setActiveTab("roles")}
            >
              Ruoli ({roles.length})
            </TabButton>
            <TabButton
              active={activeTab === "compensation-settings"}
              onClick={() => setActiveTab("compensation-settings")}
            >
              Impostazioni compensi
            </TabButton>
          </div>
        </div>

        {activeTab === "members" ? (
          <MembersList members={members} onEdit={openMemberEdit} />
        ) : activeTab === "roles" ? (
          <RolesList
            roles={roles}
            members={members}
            onEdit={openRole}
            onDelete={deleteRole}
            saving={saving}
          />
        ) : (
          <AdminTeamCompensationSettings />
        )}
      </section>

      {roleDraft ? (
        <RoleModal
          draft={roleDraft}
          permissions={permissions}
          saving={saving}
          onChange={setRoleDraft}
          onClose={() => setRoleDraft(null)}
          onSubmit={saveRole}
        />
      ) : null}

      {memberDraft ? (
        <MemberCreationModal
          draft={memberDraft}
          roles={activeRoles}
          saving={saving}
          onChange={setMemberDraft}
          onClose={() => setMemberDraft(null)}
          onSubmit={createMember}
        />
      ) : null}

      {editingMember ? (
        <MemberEditModal
          member={editingMember}
          firstName={editMemberFirstName}
          lastName={editMemberLastName}
          roleId={editMemberRoleId}
          badgeColor={editMemberBadgeColor}
          whatsappNumber={editMemberWhatsappNumber}
          telegramContact={editMemberTelegramContact}
          contactEmail={editMemberContactEmail}
          paypalEmail={editMemberPaypalEmail}
          roles={activeRoles}
          saving={saving}
          onFirstNameChange={setEditMemberFirstName}
          onLastNameChange={setEditMemberLastName}
          onRoleChange={setEditMemberRoleId}
          onBadgeColorChange={setEditMemberBadgeColor}
          onWhatsappNumberChange={setEditMemberWhatsappNumber}
          onTelegramContactChange={setEditMemberTelegramContact}
          onContactEmailChange={setEditMemberContactEmail}
          onPaypalEmailChange={setEditMemberPaypalEmail}
          onStatusToggle={() => void toggleMemberStatus(editingMember)}
          onResendInvite={() => void resendMemberInvite(editingMember)}
          onClose={() => setEditingMember(null)}
          onSubmit={saveMember}
        />
      ) : null}
    </div>
  );
}

function MembersList({
  members,
  onEdit,
}: {
  members: TeamMember[];
  onEdit: (member: TeamMember) => void;
}) {
  if (!members.length) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Nessun membro nel Team"
        text="Crea prima un ruolo, poi invita un collaboratore o aggiungilo manualmente."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-200">
      {members.map((member) => (
        <button
          key={member.id}
          type="button"
          className="grid w-full gap-4 p-5 text-left transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1.4fr)_minmax(160px,0.8fr)_auto] sm:items-center"
          onClick={() => onEdit(member)}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 font-bold text-green">
              {memberInitials(member)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{memberName(member)}</p>
              <p className="mt-1 truncate text-sm text-muted">
                {member.profile?.email ?? "Email non disponibile"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">
              {member.role?.name ?? "Ruolo non disponibile"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {member.creation_mode === "invite"
                ? "Invitato tramite email"
                : "Creato manualmente"}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <StatusBadge status={member.status} />
            <ChevronRight className="text-slate-400" size={18} />
          </div>
        </button>
      ))}
    </div>
  );
}

function RolesList({
  roles,
  members,
  onEdit,
  onDelete,
  saving,
}: {
  roles: TeamRole[];
  members: TeamMember[];
  onEdit: (role: TeamRole) => void;
  onDelete: (role: TeamRole) => void;
  saving: boolean;
}) {
  if (!roles.length) {
    return (
      <EmptyState
        icon={KeyRound}
        title="Nessun ruolo configurato"
        text="Crea un ruolo e scegli con precisione le sezioni accessibili."
      />
    );
  }

  return (
    <div className="grid gap-4 p-5 md:grid-cols-2">
      {roles.map((role) => {
        const assignedMembers = members.filter(
          (member) => member.role_id === role.id,
        ).length;

        return (
          <article className="rounded-lg border border-slate-200 p-5" key={role.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-ink">{role.name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      role.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {role.is_active ? "Attivo" : "Disattivato"}
                  </span>
                </div>
                <p className="mt-2 min-h-10 text-sm leading-5 text-muted">
                  {role.description || "Nessuna descrizione."}
                </p>
              </div>
              <ShieldCheck className="shrink-0 text-green" size={22} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {role.permissions.length} permessi
              </span>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {assignedMembers} membri
              </span>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                className="btn btn-secondary flex-1"
                type="button"
                onClick={() => onEdit(role)}
              >
                <Pencil size={16} />
                Modifica
              </button>
              <button
                className="icon-button text-red-600"
                type="button"
                aria-label={`Elimina ${role.name}`}
                title="Elimina ruolo"
                disabled={saving || assignedMembers > 0}
                onClick={() => onDelete(role)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RoleModal({
  draft,
  permissions,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: RoleDraft;
  permissions: TeamPermission[];
  saving: boolean;
  onChange: (draft: RoleDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const sections = Array.from(new Set(permissions.map((permission) => permission.section)));

  return (
    <Modal
      title={draft.id ? "Modifica ruolo" : "Crea un ruolo"}
      subtitle="Definisci cosa può vedere e modificare chi riceve questo ruolo."
      onClose={onClose}
      wide
    >
      <form className="grid gap-6" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome ruolo *">
            <input
              className="form-input"
              value={draft.name}
              minLength={2}
              maxLength={80}
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
              placeholder="Es. Moderatore lead"
              required
            />
          </Field>
          <Field label="Stato">
            <select
              className="form-input"
              value={draft.isActive ? "active" : "inactive"}
              onChange={(event) =>
                onChange({ ...draft, isActive: event.target.value === "active" })
              }
            >
              <option value="active">Attivo</option>
              <option value="inactive">Disattivato</option>
            </select>
          </Field>
        </div>
        <Field label="Descrizione">
          <textarea
            className="form-input min-h-24 resize-y py-3"
            value={draft.description}
            maxLength={500}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
            placeholder="Descrivi brevemente le responsabilità del ruolo."
          />
        </Field>

        <div>
          <div className="mb-3">
            <h3 className="font-semibold text-ink">Permessi del ruolo</h3>
            <p className="mt-1 text-sm text-muted">
              La gestione include anche la visualizzazione della sezione.
            </p>
          </div>
          <div className="grid gap-5">
            {sections.map((section) => (
              <div key={section}>
                <p className="mb-2 text-xs font-bold uppercase text-slate-500">
                  {section}
                </p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  {permissions
                    .filter((permission) => permission.section === section)
                    .map((permission) => (
                      <div
                        className="grid gap-3 border-b border-slate-200 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                        key={permission.key}
                      >
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {permission.label}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-muted">
                            {permission.description}
                          </p>
                        </div>
                        <select
                          className="form-input min-w-44"
                          value={draft.permissions[permission.key] ?? "none"}
                          onChange={(event) =>
                            onChange({
                              ...draft,
                              permissions: {
                                ...draft.permissions,
                                [permission.key]: event.target.value as
                                  | "none"
                                  | AccessLevel,
                              },
                            })
                          }
                        >
                          <option value="none">Nessun accesso</option>
                          <option value="read">Sola lettura</option>
                          {permission.supports_write ? (
                            <option value="write">Gestione</option>
                          ) : null}
                        </select>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <ModalActions saving={saving} onClose={onClose} submitLabel="Salva ruolo" />
      </form>
    </Modal>
  );
}

function MemberCreationModal({
  draft,
  roles,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: MemberDraft;
  roles: TeamRole[];
  saving: boolean;
  onChange: (draft: MemberDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      title="Aggiungi un membro"
      subtitle="Scegli se inviare un invito oppure creare subito l'account."
      onClose={onClose}
    >
      <form className="grid gap-5" onSubmit={onSubmit}>
        <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          <ModeButton
            active={draft.mode === "invite"}
            icon={MailPlus}
            label="Invito email"
            onClick={() => onChange({ ...draft, mode: "invite", password: "" })}
          />
          <ModeButton
            active={draft.mode === "manual"}
            icon={UserPlus}
            label="Creazione manuale"
            onClick={() => onChange({ ...draft, mode: "manual" })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *">
            <input
              className="form-input"
              value={draft.firstName}
              onChange={(event) =>
                onChange({ ...draft, firstName: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Cognome *">
            <input
              className="form-input"
              value={draft.lastName}
              onChange={(event) =>
                onChange({ ...draft, lastName: event.target.value })
              }
              required
            />
          </Field>
        </div>
        <Field label="Email *">
          <input
            className="form-input"
            type="email"
            autoComplete="email"
            value={draft.email}
            onChange={(event) => onChange({ ...draft, email: event.target.value })}
            required
          />
        </Field>
        <Field label="Ruolo *">
          <select
            className="form-input"
            value={draft.roleId}
            onChange={(event) => onChange({ ...draft, roleId: event.target.value })}
            required
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        {draft.mode === "manual" ? (
          <Field
            label="Password temporanea *"
            hint="Almeno 12 caratteri. Il membro dovrà cambiarla al primo accesso."
          >
            <div className="flex gap-2">
              <input
                className="form-input min-w-0 flex-1"
                type="text"
                autoComplete="off"
                minLength={12}
                maxLength={128}
                value={draft.password}
                onChange={(event) =>
                  onChange({ ...draft, password: event.target.value })
                }
                required
              />
              <button
                className="icon-button"
                type="button"
                aria-label="Copia password"
                title="Copia password"
                onClick={() => void navigator.clipboard.writeText(draft.password)}
                disabled={!draft.password}
              >
                <Copy size={17} />
              </button>
            </div>
          </Field>
        ) : (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            Il membro riceverà un’email per attivare l’account e impostare una
            password personale.
          </div>
        )}
        <ModalActions
          saving={saving}
          onClose={onClose}
          submitLabel={draft.mode === "invite" ? "Invia invito" : "Crea membro"}
        />
      </form>
    </Modal>
  );
}

function MemberEditModal({
  member,
  firstName,
  lastName,
  roleId,
  badgeColor,
  whatsappNumber,
  telegramContact,
  contactEmail,
  paypalEmail,
  roles,
  saving,
  onFirstNameChange,
  onLastNameChange,
  onRoleChange,
  onBadgeColorChange,
  onWhatsappNumberChange,
  onTelegramContactChange,
  onContactEmailChange,
  onPaypalEmailChange,
  onStatusToggle,
  onResendInvite,
  onClose,
  onSubmit,
}: {
  member: TeamMember;
  firstName: string;
  lastName: string;
  roleId: string;
  badgeColor: string;
  whatsappNumber: string;
  telegramContact: string;
  contactEmail: string;
  paypalEmail: string;
  roles: TeamRole[];
  saving: boolean;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onRoleChange: (roleId: string) => void;
  onBadgeColorChange: (color: string) => void;
  onWhatsappNumberChange: (value: string) => void;
  onTelegramContactChange: (value: string) => void;
  onContactEmailChange: (value: string) => void;
  onPaypalEmailChange: (value: string) => void;
  onStatusToggle: () => void;
  onResendInvite: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      title={memberName(member)}
      subtitle={member.profile?.email ?? "Email non disponibile"}
      onClose={onClose}
    >
      <form className="grid gap-5" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBox label="Stato" value={statusLabel(member.status)} />
          <InfoBox
            label="Creazione"
            value={
              member.creation_mode === "invite"
                ? "Invito email"
                : "Creazione manuale"
            }
          />
          <InfoBox
            label="Ingresso nel Team"
            value={formatDate(member.joined_at ?? member.created_at)}
          />
          <InfoBox
            label="Password"
            value={
              member.must_change_password
                ? "Cambio richiesto"
                : "Aggiornata"
            }
          />
          {member.status === "invited" ? (
            <InfoBox
              label="Ultimo invito"
              value={formatDate(member.invited_at ?? member.created_at)}
            />
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome *">
            <input
              className="form-input"
              value={firstName}
              minLength={2}
              maxLength={80}
              onChange={(event) => onFirstNameChange(event.target.value)}
              required
            />
          </Field>
          <Field label="Cognome *">
            <input
              className="form-input"
              value={lastName}
              minLength={2}
              maxLength={80}
              onChange={(event) => onLastNameChange(event.target.value)}
              required
            />
          </Field>
        </div>
        <Field label="Email di registrazione">
          <input
            className="form-input bg-slate-50 text-slate-500"
            value={member.profile?.email ?? ""}
            readOnly
          />
        </Field>
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-ink">Recapiti operativi</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Questi dati sono interni al Team e possono essere diversi da quelli usati per accedere a Lead Host.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Numero WhatsApp">
              <input
                className="form-input"
                type="tel"
                value={whatsappNumber}
                maxLength={120}
                onChange={(event) => onWhatsappNumberChange(event.target.value)}
                placeholder="Es. +39 333 1234567"
              />
            </Field>
            <Field label="Contatto Telegram">
              <input
                className="form-input"
                value={telegramContact}
                maxLength={120}
                onChange={(event) => onTelegramContactChange(event.target.value)}
                placeholder="Es. @nomeutente"
              />
            </Field>
            <Field label="Email di contatto">
              <input
                className="form-input"
                type="email"
                autoComplete="email"
                value={contactEmail}
                maxLength={255}
                onChange={(event) => onContactEmailChange(event.target.value)}
                placeholder="Può essere diversa dall'email di registrazione"
              />
            </Field>
            <Field label="Email PayPal">
              <input
                className="form-input"
                type="email"
                value={paypalEmail}
                maxLength={255}
                onChange={(event) => onPaypalEmailChange(event.target.value)}
                placeholder="Email associata al conto PayPal"
              />
            </Field>
          </div>
        </div>
        <Field label="Ruolo assegnato *">
          <select
            className="form-input"
            value={roleId}
            onChange={(event) => onRoleChange(event.target.value)}
            required
          >
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Colore identificativo">
          <div className="flex items-center gap-3">
            <input
              className="size-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              type="color"
              value={badgeColor}
              aria-label="Scegli colore identificativo"
              onChange={(event) => onBadgeColorChange(event.target.value.toUpperCase())}
            />
            <span
              className="rounded-full border px-3 py-1.5 text-sm font-bold"
              style={{ borderColor: badgeColor, color: badgeColor, backgroundColor: `${badgeColor}14` }}
            >
              {memberName(member).replace(/\s+(\S)\S*$/, " $1.")}
            </span>
          </div>
        </Field>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row">
            {member.status === "invited" ? (
              <button
                className="btn btn-secondary"
                type="button"
                onClick={onResendInvite}
                disabled={saving}
              >
                {saving ? "Invio..." : "Reinvia invito"}
              </button>
            ) : null}
            <button
              className={
                member.status === "suspended"
                  ? "btn btn-secondary"
                  : "btn border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }
              type="button"
              onClick={onStatusToggle}
              disabled={saving}
            >
              {member.status === "suspended" ? "Riattiva membro" : "Sospendi membro"}
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Chiudi
            </button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        className="absolute inset-0"
        type="button"
        aria-label="Chiudi finestra"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${
          wide ? "max-w-4xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          <button
            className="icon-button shrink-0"
            type="button"
            aria-label="Chiudi"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({
  saving,
  onClose,
  submitLabel,
}: {
  saving: boolean;
  onClose: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
      <button className="btn btn-secondary" type="button" onClick={onClose}>
        Annulla
      </button>
      <button className="btn btn-primary" type="submit" disabled={saving}>
        {saving ? "Salvataggio..." : submitLabel}
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      {label}
      {children}
      {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof UserPlus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-white text-green shadow-sm" : "text-slate-600"
      }`}
      type="button"
      onClick={onClick}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-10 rounded-md px-4 text-sm font-semibold transition ${
        active ? "bg-white text-green shadow-sm" : "text-slate-600"
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof UsersRound;
}) {
  return (
    <article className="card flex items-center gap-4 p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-green">
        <Icon size={21} />
      </span>
      <div>
        <p className="text-2xl font-semibold text-ink">{value}</p>
        <p className="mt-1 text-sm font-medium text-muted">{label}</p>
      </div>
    </article>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof UsersRound;
  title: string;
  text: string;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-emerald-50 text-green">
        <Icon size={23} />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: TeamMember["status"] }) {
  const styles = {
    active: "bg-emerald-50 text-emerald-700",
    invited: "bg-blue-50 text-blue-700",
    suspended: "bg-red-50 text-red-700",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function memberName(member: TeamMember) {
  const name = [member.profile?.first_name, member.profile?.last_name]
    .filter(Boolean)
    .join(" ");
  return name || member.profile?.email || "Membro Team";
}

function memberInitials(member: TeamMember) {
  const values = [member.profile?.first_name, member.profile?.last_name].filter(
    Boolean,
  ) as string[];

  if (values.length) {
    return values.map((value) => value.charAt(0).toUpperCase()).join("").slice(0, 2);
  }

  return <CircleUserRound size={20} />;
}

function statusLabel(status: TeamMember["status"]) {
  if (status === "active") return "Attivo";
  if (status === "invited") return "Invito in attesa";
  return "Sospeso";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

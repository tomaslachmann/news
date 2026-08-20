import { useState } from 'react'
import type { UserRole } from '@news-triangulator/shared'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/context/AuthContext'
import type { AdminUserListItem } from '@/services/users'
import { useUsersList, useCreateUser, useUpdateUser, useDeleteUser } from '@/services/users/hooks'
import { formatDate } from '@/lib/formatDate'
import './AdminUsersPage.css'

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Admin',
  READONLY: 'Pouze pro čtení',
}

function RoleSelect({
  id,
  value,
  onChange,
}: {
  id: string
  value: UserRole
  onChange: (role: UserRole) => void
}) {
  return (
    <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as UserRole)}>
      <option value="READONLY">Pouze pro čtení</option>
      <option value="ADMIN">Admin</option>
    </select>
  )
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('READONLY')
  const createMutation = useCreateUser()

  const reset = () => {
    setEmail('')
    setPassword('')
    setRole('READONLY')
    createMutation.reset()
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ email, password, role }, { onSuccess: () => handleOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Vytvořit uživatele</DialogTitle>
            <DialogDescription>Přidejte nového uživatele se zadáním e-mailu, hesla a role.</DialogDescription>
          </DialogHeader>

          <div className="panel__f">
            <div className="field">
              <label className="field__l" htmlFor="create-email">
                E-mail
              </label>
              <input
                className="input"
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__l" htmlFor="create-password">
                Heslo
              </label>
              <input
                className="input"
                id="create-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label className="field__l" htmlFor="create-role">
                Role
              </label>
              <RoleSelect id="create-role" value={role} onChange={setRole} />
            </div>
          </div>

          {createMutation.isError && (
            <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
              <p className="error__p">{createMutation.error.message}</p>
            </div>
          )}

          <DialogFooter>
            <button className="btn btn--primary" type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Vytváření…' : 'Vytvořit uživatele'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserListItem
  onOpenChange: (open: boolean) => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [password, setPassword] = useState('')
  const updateMutation = useUpdateUser()

  const handleOpenChange = (next: boolean) => {
    if (!next) updateMutation.reset()
    onOpenChange(next)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = password.trim() ? { role, password } : { role }
    updateMutation.mutate({ userId: user.id, body }, { onSuccess: () => handleOpenChange(false) })
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upravit uživatele {user.email}</DialogTitle>
            <DialogDescription>Změňte roli tohoto uživatele nebo nastavte nové heslo.</DialogDescription>
          </DialogHeader>

          <div className="panel__f">
            <div className="field">
              <label className="field__l" htmlFor="edit-role">
                Role
              </label>
              <RoleSelect id="edit-role" value={role} onChange={setRole} />
            </div>
            <div className="field">
              <label className="field__l" htmlFor="edit-password">
                Nové heslo
              </label>
              <input
                className="input"
                id="edit-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ponechte prázdné pro zachování stávajícího hesla"
              />
            </div>
          </div>

          {updateMutation.isError && (
            <div className="error" style={{ marginTop: 'var(--sp-4)' }}>
              <p className="error__p">{updateMutation.error.message}</p>
            </div>
          )}

          <DialogFooter>
            <button className="btn btn--primary" type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Ukládání…' : 'Uložit změny'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserListItem
  onOpenChange: (open: boolean) => void
}) {
  const deleteMutation = useDeleteUser()

  const handleOpenChange = (next: boolean) => {
    if (!next) deleteMutation.reset()
    onOpenChange(next)
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Smazat uživatele {user.email}?</DialogTitle>
          <DialogDescription>Tuto akci nelze vrátit zpět.</DialogDescription>
        </DialogHeader>

        {deleteMutation.isError && (
          <div className="error" style={{ marginTop: 'var(--sp-3)' }}>
            <p className="error__p">{deleteMutation.error.message}</p>
          </div>
        )}

        <DialogFooter>
          <button className="btn" type="button" onClick={() => handleOpenChange(false)}>
            Zrušit
          </button>
          <button
            className="btn btn--primary"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(user.id, { onSuccess: () => handleOpenChange(false) })}
          >
            {deleteMutation.isPending ? 'Mazání…' : 'Smazat'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DisabledActionButton({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} style={{ display: 'inline-block' }}>
          <button className="btn btn--micro" disabled style={{ pointerEvents: 'none' }}>
            {label}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function UserRow({
  user,
  isSelf,
  onEdit,
  onDelete,
}: {
  user: AdminUserListItem
  isSelf: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <tr className={isSelf ? 'is-self' : undefined}>
      <td>{user.email}</td>
      <td>{ROLE_LABEL[user.role]}</td>
      <td className="dtable__d">{formatDate(user.createdAt)}</td>
      <td className="dtable__act">
        {isSelf ? (
          <DisabledActionButton label="Upravit" tooltip="Svůj vlastní účet zde nemůžete upravit" />
        ) : (
          <button className="btn btn--micro" onClick={onEdit}>
            Upravit
          </button>
        )}
        {isSelf ? (
          <DisabledActionButton label="Smazat" tooltip="Svůj vlastní účet nemůžete smazat" />
        ) : (
          <button className="btn btn--micro" onClick={onDelete}>
            Smazat
          </button>
        )}
      </td>
    </tr>
  )
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const { data: users, isLoading, isError } = useUsersList()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUserListItem | null>(null)

  const adminCount = users?.filter((u) => u.role === 'ADMIN').length ?? 0

  return (
    <TooltipProvider>
      <div className="u-wrap">
        <header className="ahead">
          <h1 className="ahead__t">Uživatelé</h1>
          <div className="ahead__act">
            <button className="btn btn--primary" onClick={() => setCreateOpen(true)}>
              Vytvořit uživatele
            </button>
          </div>
          <p className="ahead__d">
            Dvě role. <b>Admin</b> smí schvalovat koncepty, vztahy mezi událostmi a spravovat uživatele.{' '}
            <b>Pouze pro čtení</b> vidí interní obrazovky, ale nic nepotvrzuje ani nemění. Svůj vlastní účet
            zde upravit nelze — o změnu role nebo hesla požádejte druhého správce.
          </p>
        </header>

        {isLoading && <p style={{ marginTop: 'var(--sp-5)', color: 'var(--ink-3)' }}>Načítání uživatelů…</p>}
        {isError && (
          <div className="error" style={{ marginTop: 'var(--sp-5)' }}>
            <p className="error__p">Nepodařilo se načíst uživatele.</p>
          </div>
        )}

        {users && (
          <section className="qsec">
            <table className="dtable">
              <thead>
                <tr>
                  <th scope="col">E-mail</th>
                  <th scope="col">Role</th>
                  <th scope="col">Vytvořeno</th>
                  <th scope="col" className="dtable__act">
                    Akce
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUser?.id}
                    onEdit={() => setEditingUser(u)}
                    onDelete={() => setDeletingUser(u)}
                  />
                ))}
              </tbody>
            </table>
            <p className="note picknote">
              Celkem <b>{users.length}</b>, z toho <b>{adminCount}</b>{' '}
              {adminCount === 1 ? 'správce' : 'správců'}. Mazání je okamžité a nevratné; historie schválení u
              článků zůstává zachovaná i po smazání účtu.
            </p>
          </section>
        )}

        <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
        {editingUser && (
          <EditUserDialog user={editingUser} onOpenChange={(open) => !open && setEditingUser(null)} />
        )}
        {deletingUser && (
          <DeleteUserDialog user={deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)} />
        )}
      </div>
    </TooltipProvider>
  )
}

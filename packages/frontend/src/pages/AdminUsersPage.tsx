import { useState } from 'react'
import type { UserRole } from '@news-triangulator/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/context/AuthContext'
import type { AdminUserListItem } from '@/services/users'
import { useUsersList, useCreateUser, useUpdateUser, useDeleteUser } from '@/services/users/hooks'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

function RoleSelect({ value, onChange }: { value: UserRole; onChange: (role: UserRole) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as UserRole)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="READONLY">Read-only</SelectItem>
      </SelectContent>
    </Select>
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
            <DialogTitle>Create user</DialogTitle>
            <DialogDescription>Add a new user with an email, password, and role.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-role">Role</Label>
              <RoleSelect value={role} onChange={setRole} />
            </div>
          </div>

          {createMutation.isError && (
            <p className="mt-4 text-sm text-destructive">{createMutation.error.message}</p>
          )}

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create user'}
            </Button>
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
            <DialogTitle>Edit {user.email}</DialogTitle>
            <DialogDescription>Change this user's role or set a new password.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-role">Role</Label>
              <RoleSelect value={role} onChange={setRole} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-password">New password</Label>
              <Input
                id="edit-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
            </div>
          </div>

          {updateMutation.isError && (
            <p className="mt-4 text-sm text-destructive">{updateMutation.error.message}</p>
          )}

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
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
          <DialogTitle>Delete {user.email}?</DialogTitle>
          <DialogDescription>This cannot be undone.</DialogDescription>
        </DialogHeader>

        {deleteMutation.isError && <p className="text-sm text-destructive">{deleteMutation.error.message}</p>}

        <DialogFooter className="mt-2">
          <Button variant="outline" type="button" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(user.id, { onSuccess: () => handleOpenChange(false) })}
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DisabledActionButton({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block" tabIndex={0}>
          <Button variant="outline" size="sm" disabled className="pointer-events-none">
            {label}
          </Button>
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
    <TableRow>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
          {user.role === 'ADMIN' ? 'Admin' : 'Read-only'}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          {isSelf ? (
            <DisabledActionButton label="Edit" tooltip="You can't edit your own account here" />
          ) : (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {isSelf ? (
            <DisabledActionButton label="Delete" tooltip="You can't delete your own account" />
          ) : (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth()
  const { data: users, isLoading, isError } = useUsersList()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUserListItem | null>(null)

  return (
    <TooltipProvider>
      <main className="container mx-auto py-10 max-w-4xl">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Users</h1>
          <Button onClick={() => setCreateOpen(true)}>Create user</Button>
        </div>

        {isLoading && <p className="mt-8 text-muted-foreground">Loading users…</p>}
        {isError && <p className="mt-8 text-destructive">Failed to load users.</p>}

        {users && (
          <Table className="mt-8">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isSelf={u.id === currentUser?.id}
                  onEdit={() => setEditingUser(u)}
                  onDelete={() => setDeletingUser(u)}
                />
              ))}
            </TableBody>
          </Table>
        )}

        <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
        {editingUser && (
          <EditUserDialog user={editingUser} onOpenChange={(open) => !open && setEditingUser(null)} />
        )}
        {deletingUser && (
          <DeleteUserDialog user={deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)} />
        )}
      </main>
    </TooltipProvider>
  )
}

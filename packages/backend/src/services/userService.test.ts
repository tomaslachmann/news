import { describe, it, expect, beforeEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import * as userRepo from '../repositories/user.js'
import { listUsers, createUser, updateUser, deleteUser } from './userService.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'

vi.mock('../repositories/user.js')
vi.mock('bcryptjs')

const ADMIN = {
  id: 'admin-1',
  email: 'admin@example.com',
  passwordHash: 'hashed',
  role: 'ADMIN' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const OTHER = {
  id: 'user-2',
  email: 'other@example.com',
  passwordHash: 'hashed-2',
  role: 'READONLY' as const,
  createdAt: new Date('2026-01-02T00:00:00Z'),
}

describe('listUsers', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps each repository row to an AdminUserListItem', async () => {
    vi.mocked(userRepo.findAllUsers).mockResolvedValue([ADMIN, OTHER])

    const result = await listUsers()

    expect(result).toEqual([
      { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'user-2', email: 'other@example.com', role: 'READONLY', createdAt: '2026-01-02T00:00:00.000Z' },
    ])
  })
})

describe('createUser', () => {
  beforeEach(() => vi.resetAllMocks())

  it('hashes the password and creates the user when the email is free', async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValue(null)
    vi.mocked(bcrypt.hash).mockResolvedValue('bcrypt-hash' as never)
    vi.mocked(userRepo.createUser).mockResolvedValue({
      id: 'new-1',
      email: 'new@example.com',
      passwordHash: 'bcrypt-hash',
      role: 'READONLY',
      createdAt: new Date('2026-01-03T00:00:00Z'),
    })

    const result = await createUser({ email: 'new@example.com', password: 'secret', role: 'READONLY' })

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 12)
    expect(userRepo.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      passwordHash: 'bcrypt-hash',
      role: 'READONLY',
    })
    expect(result).toEqual({
      id: 'new-1',
      email: 'new@example.com',
      role: 'READONLY',
      createdAt: '2026-01-03T00:00:00.000Z',
    })
  })

  it('throws ConflictError when the email is already in use', async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValue(ADMIN)

    await expect(createUser({ email: ADMIN.email, password: 'secret', role: 'READONLY' })).rejects.toThrow(
      ConflictError
    )
    expect(userRepo.createUser).not.toHaveBeenCalled()
  })
})

describe('updateUser', () => {
  beforeEach(() => vi.resetAllMocks())

  it('updates the role of another user', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(OTHER)
    vi.mocked(userRepo.updateUser).mockResolvedValue({ ...OTHER, role: 'ADMIN' })

    const result = await updateUser(ADMIN.id, OTHER.id, { role: 'ADMIN' })

    expect(userRepo.updateUser).toHaveBeenCalledWith(OTHER.id, { role: 'ADMIN', passwordHash: undefined })
    expect(result.role).toBe('ADMIN')
  })

  it('hashes and applies a new password when provided', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(OTHER)
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never)
    vi.mocked(userRepo.updateUser).mockResolvedValue(OTHER)

    await updateUser(ADMIN.id, OTHER.id, { password: 'new-password' })

    expect(bcrypt.hash).toHaveBeenCalledWith('new-password', 12)
    expect(userRepo.updateUser).toHaveBeenCalledWith(OTHER.id, { role: undefined, passwordHash: 'new-hash' })
  })

  it('throws ValidationError when an Admin tries to change their own role', async () => {
    await expect(updateUser(ADMIN.id, ADMIN.id, { role: 'READONLY' })).rejects.toThrow(ValidationError)
    expect(userRepo.updateUser).not.toHaveBeenCalled()
  })

  it('allows an Admin to reset their own password', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(ADMIN)
    vi.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never)
    vi.mocked(userRepo.updateUser).mockResolvedValue(ADMIN)

    await updateUser(ADMIN.id, ADMIN.id, { password: 'new-password' })

    expect(userRepo.updateUser).toHaveBeenCalledWith(ADMIN.id, { role: undefined, passwordHash: 'new-hash' })
  })

  it('throws NotFoundError when the target user does not exist', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(null)

    await expect(updateUser(ADMIN.id, 'missing', { role: 'ADMIN' })).rejects.toThrow(NotFoundError)
  })
})

describe('deleteUser', () => {
  beforeEach(() => vi.resetAllMocks())

  it('deletes another user', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(OTHER)

    await deleteUser(ADMIN.id, OTHER.id)

    expect(userRepo.deleteUser).toHaveBeenCalledWith(OTHER.id)
  })

  it('throws ValidationError when an Admin tries to delete themselves', async () => {
    await expect(deleteUser(ADMIN.id, ADMIN.id)).rejects.toThrow(ValidationError)
    expect(userRepo.deleteUser).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the target user does not exist', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(null)

    await expect(deleteUser(ADMIN.id, 'missing')).rejects.toThrow(NotFoundError)
  })
})

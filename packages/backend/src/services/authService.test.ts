import { describe, it, expect, beforeEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import * as userRepo from '../repositories/user.js'
import { authenticate, getCurrentUser } from './authService.js'

vi.mock('../repositories/user.js')
vi.mock('bcryptjs')

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  passwordHash: 'hashed',
  role: 'ADMIN' as const,
  createdAt: new Date(),
}

describe('authenticate', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.JWT_SECRET = 'test-secret'
  })

  it('returns null when no user exists for the email', async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValue(null)

    expect(await authenticate('nobody@example.com', 'password')).toBeNull()
  })

  it('returns null when the password is wrong', async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValue(USER)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    expect(await authenticate(USER.email, 'wrong-password')).toBeNull()
  })

  it('returns a session with a signed token on valid credentials', async () => {
    vi.mocked(userRepo.findUserByEmail).mockResolvedValue(USER)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const result = await authenticate(USER.email, 'correct-password')

    expect(result?.user).toEqual({ id: 'u1', email: USER.email, role: 'ADMIN' })
    expect(typeof result?.token).toBe('string')
  })
})

describe('getCurrentUser', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when the user no longer exists', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(null)

    expect(await getCurrentUser('u1')).toBeNull()
  })

  it('returns the public user shape, without the password hash', async () => {
    vi.mocked(userRepo.findUserById).mockResolvedValue(USER)

    expect(await getCurrentUser('u1')).toEqual({ id: 'u1', email: USER.email, role: 'ADMIN' })
  })
})

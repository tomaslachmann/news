import bcrypt from 'bcryptjs'
import * as userRepo from './repositories/user.js'

export async function seedAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) {
    return
  }

  const existingUser = await userRepo.findAnyUser()
  if (existingUser) {
    return
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12)

  await userRepo.createUser({
    email: adminEmail,
    passwordHash,
    role: 'ADMIN',
  })

  console.log(`Admin user created: ${adminEmail}`)
}

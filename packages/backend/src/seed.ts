import bcrypt from 'bcryptjs'
import { prisma } from './db.js'

export async function seedAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) {
    return
  }

  const existingUser = await prisma.user.findFirst()
  if (existingUser) {
    return
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12)

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
    },
  })

  console.log(`Admin user created: ${adminEmail}`)
}

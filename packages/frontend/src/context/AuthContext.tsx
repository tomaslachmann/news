import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'

export interface AuthUser {
  id: string
  email: string
  role: 'ADMIN' | 'READONLY'
}

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
})

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error('Failed to fetch /api/me')
  return res.json() as Promise<AuthUser>
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

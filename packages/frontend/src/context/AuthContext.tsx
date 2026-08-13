import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMe, type AuthUser } from '@/services/auth'

export type { AuthUser }

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })

  return <AuthContext.Provider value={{ user, isLoading }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

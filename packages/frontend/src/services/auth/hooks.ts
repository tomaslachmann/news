import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { logout } from './index'

/** Shared by both site chromes (Chrome.tsx, AdminChrome.tsx) — refetches the session so `useAuth`
 *  sees the logged-out state, then redirects to /login. */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['me'] })
      void navigate('/login', { replace: true })
    },
  })
}

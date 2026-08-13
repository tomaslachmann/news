import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateAdminUserBody, PatchAdminUserBody } from '@news-triangulator/shared'
import { fetchUsers, createUser, updateUser, deleteUser } from './index'

const USERS_QUERY_KEY = ['admin-users']

export function useUsersList() {
  return useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: fetchUsers,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateAdminUserBody) => createUser(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, body }: { userId: string; body: PatchAdminUserBody }) => updateUser(userId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  })
}

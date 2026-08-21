import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchEntityAliasCandidates, confirmEntityAliasMerge, rejectEntityAliasMerge } from './index'

const ENTITY_ALIAS_CANDIDATES_QUERY_KEY = ['entity-alias-candidates']

export function useEntityAliasCandidates() {
  return useQuery({
    queryKey: ENTITY_ALIAS_CANDIDATES_QUERY_KEY,
    queryFn: fetchEntityAliasCandidates,
  })
}

function useEntityAliasDecision<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ENTITY_ALIAS_CANDIDATES_QUERY_KEY })
    },
  })
}

export function useConfirmEntityAliasMerge() {
  return useEntityAliasDecision(
    ({ pairId, survivingEntityId }: { pairId: string; survivingEntityId: string }) =>
      confirmEntityAliasMerge(pairId, survivingEntityId)
  )
}

export function useRejectEntityAliasMerge() {
  return useEntityAliasDecision((pairId: string) => rejectEntityAliasMerge(pairId))
}

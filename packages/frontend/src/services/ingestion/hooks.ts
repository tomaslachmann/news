import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPendingAdditions, approveDraft, rejectDraft } from './index'

const PENDING_ADDITIONS_QUERY_KEY = ['ingestion-pending-additions']

export function usePendingAdditions() {
  return useQuery({
    queryKey: PENDING_ADDITIONS_QUERY_KEY,
    queryFn: fetchPendingAdditions,
  })
}

function useDraftDecision(mutationFn: (analysisId: string) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
      void queryClient.invalidateQueries({ queryKey: PENDING_ADDITIONS_QUERY_KEY })
    },
  })
}

export function useApproveDraft() {
  return useDraftDecision(approveDraft)
}

export function useRejectDraft() {
  return useDraftDecision(rejectDraft)
}

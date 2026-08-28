import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  confirmEntityWikidataSuggestion,
  dismissEntityWikidataSuggestion,
  fetchEntityWikidataSuggestions,
  rejectEntityWikidataCandidate,
} from './index'

const ENTITY_WIKIDATA_SUGGESTIONS_QUERY_KEY = ['entity-wikidata-suggestions']

export function useEntityWikidataSuggestions() {
  return useQuery({
    queryKey: ENTITY_WIKIDATA_SUGGESTIONS_QUERY_KEY,
    queryFn: fetchEntityWikidataSuggestions,
  })
}

function useSuggestionDecision<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ENTITY_WIKIDATA_SUGGESTIONS_QUERY_KEY })
    },
  })
}

export function useConfirmEntityWikidataSuggestion() {
  return useSuggestionDecision(({ entityKey, wikidataId }: { entityKey: string; wikidataId: string }) =>
    confirmEntityWikidataSuggestion(entityKey, wikidataId)
  )
}

export function useRejectEntityWikidataCandidate() {
  return useSuggestionDecision(({ entityKey, wikidataId }: { entityKey: string; wikidataId: string }) =>
    rejectEntityWikidataCandidate(entityKey, wikidataId)
  )
}

export function useDismissEntityWikidataSuggestion() {
  return useSuggestionDecision((entityKey: string) => dismissEntityWikidataSuggestion(entityKey))
}

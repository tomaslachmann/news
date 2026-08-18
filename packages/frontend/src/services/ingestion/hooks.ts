import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPendingAdditions,
  fetchVisibleDrafts,
  approveDraft,
  rejectDraft,
  fetchPendingStoryRelations,
  approveStoryRelation,
  rejectStoryRelation,
} from './index'
import { usePaginatedQuery } from '../pagination'

const PENDING_ADDITIONS_QUERY_KEY = ['ingestion-pending-additions']
const VISIBLE_DRAFTS_QUERY_KEY = ['ingestion-visible-drafts']
const PENDING_STORY_RELATIONS_QUERY_KEY = ['ingestion-pending-story-relations']

export function usePendingAdditions() {
  return useQuery({
    queryKey: PENDING_ADDITIONS_QUERY_KEY,
    queryFn: fetchPendingAdditions,
  })
}

export function useVisibleDrafts() {
  return usePaginatedQuery(VISIBLE_DRAFTS_QUERY_KEY, fetchVisibleDrafts)
}

function useDraftDecision(mutationFn: (analysisId: string) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
      void queryClient.invalidateQueries({ queryKey: PENDING_ADDITIONS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: VISIBLE_DRAFTS_QUERY_KEY })
    },
  })
}

export function useApproveDraft() {
  return useDraftDecision(approveDraft)
}

export function useRejectDraft() {
  return useDraftDecision(rejectDraft)
}

export function usePendingStoryRelations() {
  return useQuery({
    queryKey: PENDING_STORY_RELATIONS_QUERY_KEY,
    queryFn: fetchPendingStoryRelations,
  })
}

function useStoryRelationDecision(mutationFn: (id: string) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PENDING_STORY_RELATIONS_QUERY_KEY })
    },
  })
}

export function useApproveStoryRelation() {
  return useStoryRelationDecision(approveStoryRelation)
}

export function useRejectStoryRelation() {
  return useStoryRelationDecision(rejectStoryRelation)
}

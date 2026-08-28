import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchPendingAdditions,
  fetchVisibleDrafts,
  approveDraft,
  rejectDraft,
  approvePendingAddition,
  rejectPendingAddition,
  fetchPendingStoryRelations,
  approveStoryRelation,
  rejectStoryRelation,
  type DraftQueueParams,
  type PendingAdditionQueueParams,
  type StoryRelationQueueParams,
} from './index'
import { usePagedQuery } from '../pagination'

const PENDING_ADDITIONS_QUERY_KEY = ['ingestion-pending-additions']
const VISIBLE_DRAFTS_QUERY_KEY = ['ingestion-visible-drafts']
const PENDING_STORY_RELATIONS_QUERY_KEY = ['ingestion-pending-story-relations']

export function usePendingAdditions(params: PendingAdditionQueueParams) {
  return usePagedQuery([...PENDING_ADDITIONS_QUERY_KEY, params], () => fetchPendingAdditions(params))
}

export function useVisibleDrafts(params: DraftQueueParams) {
  return usePagedQuery([...VISIBLE_DRAFTS_QUERY_KEY, params], () => fetchVisibleDrafts(params))
}

export function usePendingStoryRelations(params: StoryRelationQueueParams) {
  return usePagedQuery([...PENDING_STORY_RELATIONS_QUERY_KEY, params], () =>
    fetchPendingStoryRelations(params)
  )
}

function useDraftDecision<TResult>(mutationFn: (analysisId: string) => Promise<TResult>) {
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

function usePendingAdditionDecision(mutationFn: (id: string) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analyses'] })
      void queryClient.invalidateQueries({ queryKey: PENDING_ADDITIONS_QUERY_KEY })
    },
  })
}

export function useApprovePendingAddition() {
  return usePendingAdditionDecision(approvePendingAddition)
}

export function useRejectPendingAddition() {
  return usePendingAdditionDecision(rejectPendingAddition)
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

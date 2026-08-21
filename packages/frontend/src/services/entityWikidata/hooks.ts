import { useMutation } from '@tanstack/react-query'
import { fetchWikidataCandidates, linkEntityWikidata, unlinkEntityWikidata } from './index'

export function useSearchWikidataCandidates() {
  return useMutation({
    mutationFn: ({ entityKey, query }: { entityKey: string; query: string }) =>
      fetchWikidataCandidates(entityKey, query),
  })
}

export function useLinkEntityWikidata() {
  return useMutation({
    mutationFn: ({ entityKey, wikidataId }: { entityKey: string; wikidataId: string }) =>
      linkEntityWikidata(entityKey, { wikidataId }),
  })
}

export function useUnlinkEntityWikidata() {
  return useMutation({
    mutationFn: (entityKey: string) => unlinkEntityWikidata(entityKey),
  })
}

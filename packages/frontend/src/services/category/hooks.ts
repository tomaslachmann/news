import { usePaginatedQuery } from '../pagination'
import { fetchCategoryArticles } from './index'

export function useCategoryArticlesList(slug: string | undefined) {
  return usePaginatedQuery(['category', slug], (cursor) => fetchCategoryArticles(slug!, cursor))
}

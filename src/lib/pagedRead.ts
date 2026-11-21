// Supabase/PostgREST silently returns at most 1000 rows per request. This reads
// every page of a query until a short page comes back, so lists are never
// truncated without warning. The caller must give the query a stable .order().

export interface PageResult<T> {
  data: T[] | null
  error: { message: string } | null
}

export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { rows, error: error.message }
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return { rows, error: null }
}

// PostgREST silently returns at most `max_rows` rows per request (1,000 on
// Supabase, see supabase/config.toml). A sum over a select that can grow past
// that would undercount without any error, so such reads fetch every page.
export const POSTGREST_MAX_ROWS = 1000;

interface PageResult<Row> {
  data: Row[] | null;
  error: unknown;
}

// `page(from, to)` must return the rows at positions from..to (inclusive) of a
// stably ordered query, e.g. `query.order("id").range(from, to)`.
export async function selectAllRows<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  pageSize = POSTGREST_MAX_ROWS,
): Promise<Row[]> {
  const rows: Row[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }
  }
}

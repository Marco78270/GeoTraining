export interface SearchableFilterOption {
  value: string
  label: string
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function filterOptions(
  options: SearchableFilterOption[],
  query: string,
): SearchableFilterOption[] {
  const normalizedQuery = normalizeSearch(query)

  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) =>
    normalizeSearch(option.label).includes(normalizedQuery),
  )
}

export function matchFilterValues(
  options: SearchableFilterOption[],
  query: string,
): string[] | undefined {
  if (!normalizeSearch(query)) {
    return undefined
  }

  return filterOptions(options, query).map((option) => option.value)
}

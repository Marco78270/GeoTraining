import { describe, expect, it } from 'vitest'

import {
  filterOptions,
  matchFilterValues,
  type SearchableFilterOption,
} from './searchableFilterUtils'

const options: SearchableFilterOption[] = [
  { value: 'ci', label: 'Côte d\'Ivoire' },
  { value: 'cr', label: 'Costa Rica' },
  { value: 'fr', label: 'France' },
]

describe('filterOptions', () => {
  it('returns all options for an empty or whitespace-only query', () => {
    expect(filterOptions(options, '')).toEqual(options)
    expect(filterOptions(options, '   ')).toEqual(options)
  })

  it('matches labels without regard to case', () => {
    expect(filterOptions(options, 'FRANCE')).toEqual([
      { value: 'fr', label: 'France' },
    ])
  })

  it('matches labels without regard to accents', () => {
    expect(filterOptions(options, 'cote')).toEqual([
      { value: 'ci', label: 'Côte d\'Ivoire' },
    ])
  })

  it('matches a partial normalized query', () => {
    expect(filterOptions(options, 'sta ri')).toEqual([
      { value: 'cr', label: 'Costa Rica' },
    ])
  })

  it('returns no options when no label matches', () => {
    expect(filterOptions(options, 'Japan')).toEqual([])
  })
})

describe('matchFilterValues', () => {
  it('returns undefined for an empty or whitespace-only query', () => {
    expect(matchFilterValues(options, '')).toBeUndefined()
    expect(matchFilterValues(options, '   ')).toBeUndefined()
  })

  it('returns values whose labels match the normalized query', () => {
    expect(matchFilterValues(options, 'COTE')).toEqual(['ci'])
    expect(matchFilterValues(options, 'sta ri')).toEqual(['cr'])
  })

  it('returns an empty array when no label matches', () => {
    expect(matchFilterValues(options, 'Japan')).toEqual([])
  })
})

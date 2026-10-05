/**
 * Движок каталога: фильтры, поиск, сортировка, состояние в URL, форматирование характеристик
 * и цен. Чистые функции над данными репозитория — без React, без обращения к JSON напрямую.
 */

export {
  ATTRIBUTE_LABELS,
  NBSP,
  UNIT_LABELS,
  attributeLabel,
  attributeOrder,
  formatAttrValue,
  formatAttribute,
  formatNumber,
  formatProductAttributes,
  formatQuantity,
  formatRange,
  formatSpecLine,
  getSpecLine,
  rootCategoryOf,
} from './attributes.ts';
export type { FormattedAttribute, SpecLineItem } from './attributes.ts';

export {
  PRICE_ON_REQUEST_LABEL,
  formatPrice,
  formatProductPrice,
  formatRubleAmount,
  formatRubles,
  preliminaryTotal,
} from './price.ts';
export type { PreliminaryTotal, PriceLine } from './price.ts';

export {
  formatFrequencyQuery,
  frequencyMatches,
  getProductFrequency,
  parseFrequencyInput,
  productMatchesFrequency,
  serializeFrequencyQuery,
} from './frequency.ts';
export type { FrequencyMode, FrequencyQuery, FrequencyRange } from './frequency.ts';

export {
  FILTER_PARAM_KINDS,
  filterGroupFor,
  optionKey,
  participates,
  runFilters,
} from './filters.ts';
export type {
  Facet,
  FacetOption,
  FilterGroupId,
  FilterRun,
  FlagFacet,
  FrequencyFacet,
  OptionsFacet,
  PriceFacet,
  RangeFacet,
  RequestFacet,
} from './filters.ts';

export { parseSearchQuery, scoreProduct, searchProducts, suggest } from './search.ts';
export type { SearchHit, SearchSource, Suggestion } from './search.ts';

export { applyQuery, sortProducts } from './query.ts';
export type { QueryContext, QueryResult } from './query.ts';

export {
  DEFAULT_PAGE_SIZE,
  DEFAULT_VIEW,
  SORT_KEYS,
  SORT_LABELS,
  VIEW_MODES,
  createCatalogState,
  hasActiveFilters,
  parseNumericRange,
  removeChip,
  resetFilters,
  serializeNumericRange,
  setFrequency,
  setPriceRange,
  setRangeFilter,
  setRequestOnly,
  setStrict,
  toggleFilterValue,
} from './state.ts';
export type { ActiveChip, CatalogState, NumericRange, SortKey, ViewMode } from './state.ts';

export { catalogQueryString, parseCatalogState, serializeCatalogState } from './url-state.ts';
export type { SearchParamsInput } from './url-state.ts';

export { nonBreakingText, technicalSegments } from './typography.ts';
export type { TextSegment } from './typography.ts';

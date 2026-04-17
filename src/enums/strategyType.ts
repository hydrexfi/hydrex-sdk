/**
 * Canonical strategy-type values as they appear in the live strategies API
 * response ("type" field). Apps should use these constants rather than raw
 * string literals so any future renames surface as type errors.
 */
export enum StrategyType {
  NARROW       = 'Narrow',
  CORRELATED   = 'Correlated',
  LONG_SHORT   = 'Long-Short',
  SINGLE_SIDED = 'Single Sided',
  CLASSIC      = 'Classic',
  MANUAL       = 'Manual',
  /** Single-sided lending strategy (Morpho, Euler). */
  LENDING      = 'Lending',
}

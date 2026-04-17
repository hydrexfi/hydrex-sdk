/**
 * Canonical liquidity-type values as they appear in the live strategies API
 * response (strategies/<chainId>.json). Apps should use these constants rather
 * than raw string literals so any future renames surface as type errors.
 */
export enum LiquidityType {
  INTEGRAL         = 'integral',
  UNI_V4           = 'uniV4',
  CLASSIC_VOLATILE = 'classic-volatile',
  CLASSIC_STABLE   = 'classic-stable',
  INTEGRAL_MANUAL  = 'integral-manual',
  /** Morpho lending vault — receipt token staked in a Hydrex gauge. */
  MORPHO           = 'morpho',
  /** Euler lending vault — receipt token staked in a Hydrex gauge. */
  EULER            = 'euler',
}

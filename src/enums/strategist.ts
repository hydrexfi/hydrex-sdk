export enum Strategist {
  GAMMA = 'Gamma',
  ICHI = 'Ichi',
  HYDREX = 'Hydrex',
  MORPHO = 'Morpho',
  EULER = 'Euler',
}

/**
 * Strategists whose gauge stake amounts use the deposit token's decimals
 * (token0.decimals) rather than 18. These are lending-type strategies where
 * the "LP" is a 1:1 receipt token rather than a geometric-mean LP share.
 *
 * Apps must use token0.decimals (not 18) when calling parseUnits/formatUnits
 * for these strategy types.
 */
export const TOKEN_BASED_STRATEGISTS = new Set<Strategist>([
  Strategist.MORPHO,
  Strategist.EULER,
]);

export function isTokenBasedStrategist(strategist: Strategist): boolean {
  return TOKEN_BASED_STRATEGISTS.has(strategist);
}

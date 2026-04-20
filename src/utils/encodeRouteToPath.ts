import { pack } from '@ethersproject/solidity';
import { Pool } from '../entities/pool';
import { Route } from '../entities/route';
import { Currency } from '../entities';
import { AnyToken } from '../types';

/**
 * Converts a route to a hex-encoded path suitable for the Hydrex swap router.
 *
 * Unlike the standard Uniswap v3 path format (tokenA, fee, tokenB), Hydrex
 * encodes the pool deployer address instead of the fee tier:
 *   (tokenA, deployer, tokenB [, deployer, tokenC …])
 *
 * @param route the route to convert to an encoded path
 * @param exactOutput whether the route should be encoded in reverse, for exact output swaps
 * @returns ABI-packed hex path string
 */
export function encodeRouteToPath(
  route: Route<Currency, Currency>,
  exactOutput: boolean
): string {
  const firstInputToken: AnyToken = route.input.wrapped;

  const { path, types } = route.pools.reduce(
    (
      {
        inputToken,
        path,
        types,
      }: {
        inputToken: AnyToken;
        path: (string | number)[];
        types: string[];
      },
      pool: Pool,
      index
    ): {
      inputToken: AnyToken;
      path: (string | number)[];
      types: string[];
    } => {
      const outputToken: AnyToken = pool.token0.equals(inputToken)
        ? pool.token1
        : pool.token0;
      if (index === 0) {
        return {
          inputToken: outputToken,
          types: ['address', 'address', 'address'],
          path: [inputToken.address, pool.deployer, outputToken.address],
        };
      } else {
        return {
          inputToken: outputToken,
          types: [...types, 'address', 'address'],
          path: [...path, pool.deployer, outputToken.address],
        };
      }
    },
    { inputToken: firstInputToken, path: [], types: [] }
  );

  return exactOutput
    ? pack(types.reverse(), path.reverse())
    : pack(types, path);
}

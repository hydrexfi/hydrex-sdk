import { defaultAbiCoder } from '@ethersproject/abi';
import { getCreate2Address } from '@ethersproject/address';
import { keccak256 } from '@ethersproject/solidity';
import { POOL_DEPLOYER_ADDRESSES, POOL_INIT_CODE_HASH } from '../constants';
import { AnyToken } from '../types';

/**
 * Computes a pool address
 * @param poolDeployer The Hydrex Pool Deployer address
 * @param tokenA The first token of the pair, irrespective of sort order
 * @param tokenB The second token of the pair, irrespective of sort order
 * @param initCodeHashManualOverride The initial code hash override
 * @returns The pool address
 */
export function computePoolAddress({
  tokenA,
  tokenB,
  initCodeHashManualOverride,
  poolDeployer,
}: {
  tokenA: AnyToken;
  tokenB: AnyToken;
  initCodeHashManualOverride?: string;
  poolDeployer?: string;
}): string {
  const [token0, token1] = tokenA.sortsBefore(tokenB)
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
  return getCreate2Address(
    poolDeployer ?? POOL_DEPLOYER_ADDRESSES[tokenA.chainId],
    keccak256(
      ['bytes'],
      [
        defaultAbiCoder.encode(
          ['address', 'address'],
          [token0.address, token1.address]
        ),
      ]
    ),
    initCodeHashManualOverride ?? POOL_INIT_CODE_HASH[tokenA.chainId]
  );
}

export function computeCustomPoolAddress({
  tokenA,
  tokenB,
  customPoolDeployer,
  initCodeHashManualOverride,
  mainPoolDeployer,
}: {
  tokenA: AnyToken;
  tokenB: AnyToken;
  customPoolDeployer: string;
  initCodeHashManualOverride?: string;
  mainPoolDeployer?: string;
}): string {
  const [token0, token1] = tokenA.sortsBefore(tokenB)
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
  return getCreate2Address(
    mainPoolDeployer ?? POOL_DEPLOYER_ADDRESSES[tokenA.chainId],
    keccak256(
      ['bytes'],
      [
        defaultAbiCoder.encode(
          ['address', 'address', 'address'],
          [customPoolDeployer, token0.address, token1.address]
        ),
      ]
    ),
    initCodeHashManualOverride ?? POOL_INIT_CODE_HASH[tokenA.chainId]
  );
}

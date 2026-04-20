import { EpochDetails, GetEpochDetailsOptions } from '../types/epoch';
import { toBigInt } from './toBigInt';

/**
 * Derives human-readable epoch metadata from raw on-chain voter values.
 *
 * @param epochDuration - Raw epoch duration returned by the voter contract (seconds)
 * @param epochTimestamp - Raw epoch timestamp returned by the voter contract
 * @param options - Optional inputs: supply `currentTimestamp` to override the
 *   wall-clock time used for `timeUntilEpochFlip`, and `firstEpochStart` to
 *   enable the sequential `currentEpoch` counter
 * @returns Derived epoch details ready for display or time-based logic
 */
export function buildEpochDetails(
  epochDuration: unknown,
  epochTimestamp: unknown,
  options: GetEpochDetailsOptions = {},
): EpochDetails {
  const normalizedEpochDuration = toBigInt(epochDuration);
  const normalizedEpochTimestamp = toBigInt(epochTimestamp);
  const currentTimestamp =
    options.currentTimestamp !== undefined
      ? toBigInt(options.currentTimestamp)
      : BigInt(Math.floor(Date.now() / 1000));

  const epochStart =
    normalizedEpochTimestamp - (normalizedEpochTimestamp % normalizedEpochDuration);
  const nextEpochStart = epochStart + normalizedEpochDuration;
  const timeUntilEpochFlip =
    nextEpochStart > currentTimestamp ? nextEpochStart - currentTimestamp : BigInt(0);
  const currentEpoch =
    options.firstEpochStart !== undefined
      ? Number(
          (epochStart - toBigInt(options.firstEpochStart)) /
            normalizedEpochDuration,
        )
      : 0;

  return {
    epochStart,
    epochTimestamp: normalizedEpochTimestamp,
    currentEpoch: Math.max(0, currentEpoch),
    timeUntilEpochFlip,
    epochDuration: normalizedEpochDuration,
  };
}

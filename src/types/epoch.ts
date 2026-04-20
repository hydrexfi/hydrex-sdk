import { BigintIsh } from './BigIntish';

/** Derived epoch metadata returned by Voter.getEpochDetails and buildEpochDetails. */
export interface EpochDetails {
  /** Unix timestamp (seconds) of the start of the current epoch. */
  epochStart: bigint;
  epochTimestamp: bigint;
  /** Sequential epoch number from `firstEpochStart`, or 0 when not provided. */
  currentEpoch: number;
  /** Seconds remaining until the next epoch flip; 0 when the flip is overdue. */
  timeUntilEpochFlip: bigint;
  epochDuration: bigint;
}

/** Optional inputs that refine the output of buildEpochDetails. */
export interface GetEpochDetailsOptions {
  /** Override the current wall-clock time used for `timeUntilEpochFlip` (Unix seconds). */
  currentTimestamp?: BigintIsh;
  /** Unix timestamp of epoch 0; enables the sequential `currentEpoch` counter. */
  firstEpochStart?: BigintIsh;
}

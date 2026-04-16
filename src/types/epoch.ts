import { BigintIsh } from './BigIntish';

export interface EpochDetails {
  epochStart: bigint;
  epochTimestamp: bigint;
  currentEpoch: number;
  timeUntilEpochFlip: bigint;
  epochDuration: bigint;
}

export interface GetEpochDetailsOptions {
  currentTimestamp?: BigintIsh;
  firstEpochStart?: BigintIsh;
}

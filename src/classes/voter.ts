import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { voterABI } from '../abis/voter';
import { BigintIsh } from '../types/BigIntish';
import {
  ReadContractFunction,
  ReadContractsFunction,
} from '../types/contractReads';
import { EpochDetails, GetEpochDetailsOptions } from '../types/epoch';
import { buildEpochDetails } from '../utils/buildEpochDetails';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface VoteOptions {
  /**
   * The pool addresses to vote for.
   */
  pools: string[];

  /**
   * The vote split to assign to each pool. Must match the pools array by index.
   * These values are treated as relative proportions, not absolute voting power
   * amounts. The contract uses them to split 100% of the caller's available
   * voting power across the selected pools.
   */
  weights: BigintIsh[];
}

export interface UserVotePercents {
  owner: string;
  byPool: Record<string, string>;
  lastVotedTimestamp?: bigint;
}

export interface VoteStats {
  totalWeight: bigint;
}

export interface PoolWeights {
  [poolAddress: string]: bigint;
}

/**
 * Represents the Voter contract, and has static methods for helping execute
 * manual voting actions.
 */
export abstract class Voter {
  public static INTERFACE: Interface = new Interface(voterABI);

  private constructor() {}

  /**
   * Produces the encoded calldata needed to submit a vote across one or more pools.
   * The provided weights are treated by the contract as vote proportions, and
   * the contract derives the caller's actual voting weight from their current
   * voting power. In practice, this means the input values define how to split
   * 100% of the caller's available voting power across the selected pools.
   * @param options pools and vote split to encode
   */
  public static voteCallParameters(options: VoteOptions): MethodParameters {
    invariant(options.pools.length > 0, 'EMPTY_VOTE');
    invariant(options.pools.length === options.weights.length, 'LENGTH_MISMATCH');

    const pools = options.pools.map(pool => validateAndParseAddress(pool));
    const weights = options.weights.map(weight => toHex(weight));

    return {
      calldata: Voter.INTERFACE.encodeFunctionData('vote', [pools, weights]),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to recast the caller's existing vote
   * allocation using their current voting state.
   */
  public static pokeCallParameters(): MethodParameters {
    return {
      calldata: Voter.INTERFACE.encodeFunctionData('poke'),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to clear the caller's current vote
   * allocation.
   */
  public static resetCallParameters(): MethodParameters {
    return {
      calldata: Voter.INTERFACE.encodeFunctionData('reset'),
      value: toHex(0),
    };
  }

  public static async getPoolVoteLength(
    owner: string,
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'poolVoteLength',
        args: [validateAndParseAddress(owner)],
      }),
    );
  }

  public static async getLastVoted(
    owner: string,
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'lastVoted',
        args: [validateAndParseAddress(owner)],
      }),
    );
  }

  public static async getPoolVote(
    owner: string,
    index: BigintIsh,
    readContract: ReadContractFunction,
  ): Promise<string> {
    return validateAndParseAddress(
      String(
        await readContract({
          functionName: 'poolVote',
          args: [validateAndParseAddress(owner), toBigInt(index)],
        }),
      ),
    );
  }

  public static async getVotes(
    owner: string,
    poolAddress: string,
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'votes',
        args: [
          validateAndParseAddress(owner),
          validateAndParseAddress(poolAddress),
        ],
      }),
    );
  }

  public static async getTotalWeight(
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'totalWeight',
      }),
    );
  }

  public static async getWeight(
    poolAddress: string,
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'weights',
        args: [validateAndParseAddress(poolAddress)],
      }),
    );
  }

  public static async getEpochDetails(
    readContracts: ReadContractsFunction,
    options: GetEpochDetailsOptions = {},
  ): Promise<EpochDetails> {
    const [epochDurationResult, epochTimestampResult] = await readContracts([
      { functionName: 'getEpochDuration' },
      { functionName: '_epochTimestamp' },
    ]);

    return buildEpochDetails(epochDurationResult, epochTimestampResult, options);
  }

  public static async getUserVotePercents(
    owner: string | undefined,
    readContracts: ReadContractsFunction,
  ): Promise<UserVotePercents> {
    if (!owner) {
      return {
        owner: '',
        byPool: {},
      };
    }

    const normalizedOwner = validateAndParseAddress(owner);
    const [lengthResult, lastVotedResult] = await readContracts([
      {
        functionName: 'poolVoteLength',
        args: [normalizedOwner],
      },
      {
        functionName: 'lastVoted',
        args: [normalizedOwner],
      },
    ]);

    const count = Number(toBigInt(lengthResult));
    const lastVotedTimestamp = toBigInt(lastVotedResult);

    if (count === 0) {
      return {
        owner: normalizedOwner,
        byPool: {},
        lastVotedTimestamp,
      };
    }

    const poolResults = await readContracts(
      Array.from({ length: count }, (_, index) => ({
        functionName: 'poolVote',
        args: [normalizedOwner, BigInt(index)],
      })),
    );

    const pools = poolResults.map(result =>
      validateAndParseAddress(String(result)),
    );
    const voteResults = await readContracts(
      pools.map(poolAddress => ({
        functionName: 'votes',
        args: [normalizedOwner, poolAddress],
      })),
    );
    const weights = voteResults.map(toBigInt);
    const total = weights.reduce((sum, weight) => sum + Number(weight), 0);

    if (total <= 0) {
      return {
        owner: normalizedOwner,
        byPool: {},
        lastVotedTimestamp,
      };
    }

    const byPool: Record<string, string> = {};
    pools.forEach((poolAddress, index) => {
      const percent = (Number(weights[index]) / total) * 100;
      byPool[poolAddress] = String(Math.round(percent * 100) / 100);
    });

    return {
      owner: normalizedOwner,
      byPool,
      lastVotedTimestamp,
    };
  }

  public static async getVoteStats(
    readContract: ReadContractFunction,
  ): Promise<VoteStats> {
    return {
      totalWeight: await this.getTotalWeight(readContract),
    };
  }

  public static async getPoolWeights(
    poolAddresses: string[],
    readContracts: ReadContractsFunction,
  ): Promise<PoolWeights> {
    if (poolAddresses.length === 0) {
      return {};
    }

    const normalizedPoolAddresses = poolAddresses.map(validateAndParseAddress);
    const results = await readContracts(
      normalizedPoolAddresses.map(poolAddress => ({
        functionName: 'weights',
        args: [poolAddress],
      })),
    );

    const poolWeights: PoolWeights = {};
    normalizedPoolAddresses.forEach((poolAddress, index) => {
      poolWeights[poolAddress] = toBigInt(results[index] ?? 0);
    });

    return poolWeights;
  }

  public static hasVotedForEpoch(
    epochDetails: EpochDetails,
    lastVotedTimestamp?: BigintIsh,
  ): boolean {
    if (lastVotedTimestamp === undefined) {
      return false;
    }

    return toBigInt(lastVotedTimestamp) >= epochDetails.epochStart;
  }
}

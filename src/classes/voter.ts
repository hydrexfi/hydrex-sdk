import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { voterABI } from '../abis/voter';
import { BigintIsh } from '../types/BigIntish';
import { MethodParameters, toHex } from '../utils/calldata';
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

/**
 * Represents the Voter contract, and has static methods for helping execute
 * manual voting actions.
 */
export abstract class Voter {
  public static INTERFACE: Interface = new Interface(voterABI);

  /**
   * Cannot be constructed.
   */
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
}

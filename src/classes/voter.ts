import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { voterABI } from '../abis/voter';
import { BigintIsh } from '../types/BigIntish';
import { MethodParameters, toHex } from '../utils/calldata';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface VoteOptions {
  pools: string[];
  weights: BigintIsh[];
}

export abstract class Voter {
  public static INTERFACE: Interface = new Interface(voterABI);

  private constructor() {}

  public static voteCallParameters(options: VoteOptions): MethodParameters {
    invariant(options.pools.length === options.weights.length, 'LENGTH_MISMATCH');

    const pools = options.pools.map(pool => validateAndParseAddress(pool));
    const weights = options.weights.map(weight => toHex(weight));

    return {
      calldata: Voter.INTERFACE.encodeFunctionData('vote', [pools, weights]),
      value: toHex(0),
    };
  }

  public static pokeCallParameters(): MethodParameters {
    return {
      calldata: Voter.INTERFACE.encodeFunctionData('poke'),
      value: toHex(0),
    };
  }

  public static resetCallParameters(): MethodParameters {
    return {
      calldata: Voter.INTERFACE.encodeFunctionData('reset'),
      value: toHex(0),
    };
  }
}

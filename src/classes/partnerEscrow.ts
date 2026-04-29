import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { partnerEscrowABI } from '../abis/partnerEscrow';
import { BigintIsh } from '../types/BigIntish';
import { MethodParameters, toHex } from '../utils/calldata';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface PartnerEscrowVoteOptions {
  /**
   * The pool addresses to vote for with the escrowed veNFT.
   */
  pools: string[];

  /**
   * The vote split to assign to each pool. Must match the pools array by index.
   * Values are treated as relative proportions by the underlying voter.
   */
  weights: BigintIsh[];
}

export interface PartnerEscrowDelegateOptions {
  /**
   * Address that should receive delegated voting power for the escrowed veNFT.
   */
  delegatee: string;
}

export interface PartnerEscrowConduitApprovalOptions {
  /**
   * Conduit contract address to approve or revoke for the escrowed veNFT.
   */
  conduitAddress: string;

  /**
   * True to approve the conduit, false to revoke it.
   */
  approve: boolean;
}

export interface PartnerEscrowClaimRewardsOptions {
  /**
   * Fee distributor addresses to claim from.
   */
  feeAddresses: string[];

  /**
   * Bribe contract addresses to claim from.
   */
  bribeAddresses: string[];

  /**
   * Reward token addresses to claim from each fee or bribe contract.
   */
  claimTokens: string[];
}

/**
 * Helpers for building encoded calldata for partner escrow actions.
 *
 * The returned calldata should be sent to a PartnerEscrow contract address.
 * These methods cover partner-facing actions only; admin, factory, and
 * emergency functions are intentionally excluded from this helper surface.
 */
export abstract class PartnerEscrow {
  public static INTERFACE: Interface = new Interface(
    partnerEscrowABI as unknown as any[],
  );

  private constructor() {}

  /**
   * Produces the encoded calldata needed to submit a vote through the escrowed
   * veNFT. This uses the same calldata shape as Voter.vote, but the transaction
   * target should be the PartnerEscrow contract.
   *
   * @param options pools and vote split to encode
   */
  public static voteCallParameters(
    options: PartnerEscrowVoteOptions,
  ): MethodParameters {
    invariant(options.pools.length > 0, 'EMPTY_VOTE');
    invariant(options.pools.length === options.weights.length, 'LENGTH_MISMATCH');

    const pools = options.pools.map(pool => validateAndParseAddress(pool));
    const weights = options.weights.map(weight => toHex(weight));

    return {
      calldata: PartnerEscrow.INTERFACE.encodeFunctionData('vote', [
        pools,
        weights,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to delegate the escrowed veNFT's voting
   * power.
   *
   * @param options delegatee address to encode
   */
  public static delegateCallParameters(
    options: PartnerEscrowDelegateOptions,
  ): MethodParameters {
    const delegatee = validateAndParseAddress(options.delegatee);

    return {
      calldata: PartnerEscrow.INTERFACE.encodeFunctionData('delegate', [
        delegatee,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to approve or revoke a conduit for the
   * escrowed veNFT.
   *
   * @param options conduit address and approval toggle
   */
  public static setConduitApprovalForEscrowedTokenCallParameters(
    options: PartnerEscrowConduitApprovalOptions,
  ): MethodParameters {
    const conduitAddress = validateAndParseAddress(options.conduitAddress);

    return {
      calldata: PartnerEscrow.INTERFACE.encodeFunctionData(
        'setConduitApprovalForEscrowedToken',
        [conduitAddress, options.approve],
      ),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to claim fee and bribe rewards through
   * the partner escrow, forwarding received tokens to the partner.
   *
   * @param options fee contracts, bribe contracts, and reward tokens to claim
   */
  public static claimRewardsCallParameters(
    options: PartnerEscrowClaimRewardsOptions,
  ): MethodParameters {
    const feeAddresses = options.feeAddresses.map(address =>
      validateAndParseAddress(address),
    );
    const bribeAddresses = options.bribeAddresses.map(address =>
      validateAndParseAddress(address),
    );
    const claimTokens = options.claimTokens.map(token =>
      validateAndParseAddress(token),
    );

    return {
      calldata: PartnerEscrow.INTERFACE.encodeFunctionData('claimRewards', [
        feeAddresses,
        bribeAddresses,
        claimTokens,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to claim the escrowed veNFT after the
   * vesting period has completed.
   */
  public static claimVeTokenCallParameters(): MethodParameters {
    return {
      calldata: PartnerEscrow.INTERFACE.encodeFunctionData('claimVeToken'),
      value: toHex(0),
    };
  }
}

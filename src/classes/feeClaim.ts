import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { voterABI } from '../abis/voter';
import { BigintIsh } from '../types/BigIntish';
import { MethodParameters, toHex } from '../utils/calldata';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface FeeClaimItem {
  feeAddress: string;
  tokens: string[];
}

export interface ClaimFeeOptions {
  tokenId: BigintIsh;
  claim: FeeClaimItem;
}

export interface ClaimFeesOptions {
  tokenId: BigintIsh;
  claims: FeeClaimItem[];
}

export interface ClaimFeeToRecipientByTokenIdOptions {
  tokenId: BigintIsh;
  recipient: string;
  claim: FeeClaimItem;
}

export interface ClaimFeesToRecipientByTokenIdOptions {
  tokenId: BigintIsh;
  recipient: string;
  claims: FeeClaimItem[];
}

interface ParsedFeeClaims {
  feeAddresses: string[];
  tokenAddresses: string[][];
}

/**
 * Helpers for building encoded calldata for veNFT fee claims.
 *
 * Use these helpers when a veNFT has claimable fees and you
 * want to build the encoded transaction data for a veNFT fee claim before
 * submitting it with your own wallet or transaction flow.
 */
export abstract class FeeClaim {
  public static INTERFACE: Interface = new Interface(voterABI);

  private constructor() {}

  /**
   * Builds calldata to claim fees from a single fee contract for a veNFT.
   *
   * This is a convenience wrapper around claimFeesCallParameters for the common
   * single-claim case.
   *
   * @param options single fee-claim input
   */
  public static claimFeeCallParameters(
    options: ClaimFeeOptions,
  ): MethodParameters {
    return FeeClaim.claimFeesCallParameters({
      tokenId: options.tokenId,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim fees from one or more fee contracts for a veNFT.
   *
   * Pass one claim entry per fee contract, along with the token addresses to
   * claim from that fee contract. The order of claims and tokens is preserved.
   *
   * @param options bulk fee-claim input
   */
  public static claimFeesCallParameters(
    options: ClaimFeesOptions,
  ): MethodParameters {
    const { feeAddresses, tokenAddresses } = FeeClaim.parseClaims(options.claims);

    return {
      calldata: FeeClaim.INTERFACE.encodeFunctionData(
        'claimFees(address[],address[][],uint256)',
        [feeAddresses, tokenAddresses, toHex(options.tokenId)],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim fees from a single fee contract for a veNFT and
   * send the proceeds to a specific recipient.
   *
   * This is a convenience wrapper around
   * claimFeesToRecipientByTokenIdCallParameters for the common single-claim
   * case.
   *
   * @param options single recipient-based fee-claim input
   */
  public static claimFeeToRecipientByTokenIdCallParameters(
    options: ClaimFeeToRecipientByTokenIdOptions,
  ): MethodParameters {
    return FeeClaim.claimFeesToRecipientByTokenIdCallParameters({
      tokenId: options.tokenId,
      recipient: options.recipient,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim fees from one or more fee contracts for a veNFT
   * and send the proceeds to a specific recipient.
   *
   * Use this when the fee claim should be routed somewhere other than the
   * caller, such as a managed account or partner-controlled recipient.
   *
   * @param options bulk recipient-based fee-claim input
   */
  public static claimFeesToRecipientByTokenIdCallParameters(
    options: ClaimFeesToRecipientByTokenIdOptions,
  ): MethodParameters {
    const { feeAddresses, tokenAddresses } = FeeClaim.parseClaims(options.claims);
    const recipient = validateAndParseAddress(options.recipient);

    return {
      calldata: FeeClaim.INTERFACE.encodeFunctionData(
        'claimFeesToRecipientByTokenId(address[],address[][],uint256,address)',
        [feeAddresses, tokenAddresses, toHex(options.tokenId), recipient],
      ),
      value: toHex(0),
    };
  }

  /**
   * Validates fee-claim inputs and normalizes fee/token addresses while
   * preserving the caller-provided claim and token order.
   */
  private static parseClaims(claims: FeeClaimItem[]): ParsedFeeClaims {
    invariant(claims.length > 0, 'EMPTY_CLAIMS');

    // Preserve caller order while validating and normalizing every address.
    const feeAddresses = claims.map(claim =>
      validateAndParseAddress(claim.feeAddress),
    );
    const tokenAddresses = claims.map(claim => {
      invariant(claim.tokens.length > 0, 'EMPTY_CLAIM_TOKENS');
      return claim.tokens.map(token => validateAndParseAddress(token));
    });

    return { feeAddresses, tokenAddresses };
  }
}

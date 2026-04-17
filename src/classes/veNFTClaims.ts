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

export interface BribeClaimItem {
  bribeAddress: string;
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

export interface ClaimBribeOptions {
  tokenId: BigintIsh;
  claim: BribeClaimItem;
}

export interface ClaimBribesOptions {
  tokenId: BigintIsh;
  claims: BribeClaimItem[];
}

export interface ClaimBribeToRecipientByTokenIdOptions {
  tokenId: BigintIsh;
  recipient: string;
  claim: BribeClaimItem;
}

export interface ClaimBribesToRecipientByTokenIdOptions {
  tokenId: BigintIsh;
  recipient: string;
  claims: BribeClaimItem[];
}

interface ParsedClaims {
  sourceAddresses: string[];
  tokenAddresses: string[][];
}

/**
 * Helpers for building encoded calldata for veNFT fee and bribe claims.
 *
 * Use these helpers when a veNFT has claimable fees or bribes and you want to
 * build the encoded transaction data before submitting it with your own wallet
 * or transaction flow.
 */
export abstract class VeNFTClaims {
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
    return VeNFTClaims.claimFeesCallParameters({
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
    const { sourceAddresses, tokenAddresses } = VeNFTClaims.parseClaims(
      options.claims,
      claim => claim.feeAddress,
    );

    return {
      calldata: VeNFTClaims.INTERFACE.encodeFunctionData(
        'claimFees(address[],address[][],uint256)',
        [sourceAddresses, tokenAddresses, toHex(options.tokenId)],
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
    return VeNFTClaims.claimFeesToRecipientByTokenIdCallParameters({
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
    const { sourceAddresses, tokenAddresses } = VeNFTClaims.parseClaims(
      options.claims,
      claim => claim.feeAddress,
    );
    const recipient = validateAndParseAddress(options.recipient);

    return {
      calldata: VeNFTClaims.INTERFACE.encodeFunctionData(
        'claimFeesToRecipientByTokenId(address[],address[][],uint256,address)',
        [sourceAddresses, tokenAddresses, toHex(options.tokenId), recipient],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim bribes from a single bribe contract for a veNFT.
   *
   * This is a convenience wrapper around claimBribesCallParameters for the
   * common single-claim case.
   *
   * @param options single bribe-claim input
   */
  public static claimBribeCallParameters(
    options: ClaimBribeOptions,
  ): MethodParameters {
    return VeNFTClaims.claimBribesCallParameters({
      tokenId: options.tokenId,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim bribes from one or more bribe contracts for a
   * veNFT.
   *
   * Pass one claim entry per bribe contract, along with the token addresses to
   * claim from that bribe contract. The order of claims and tokens is
   * preserved.
   *
   * @param options bulk bribe-claim input
   */
  public static claimBribesCallParameters(
    options: ClaimBribesOptions,
  ): MethodParameters {
    const { sourceAddresses, tokenAddresses } = VeNFTClaims.parseClaims(
      options.claims,
      claim => claim.bribeAddress,
    );

    return {
      calldata: VeNFTClaims.INTERFACE.encodeFunctionData(
        'claimBribes(address[],address[][],uint256)',
        [sourceAddresses, tokenAddresses, toHex(options.tokenId)],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim bribes from a single bribe contract for a veNFT
   * and send the proceeds to a specific recipient.
   *
   * This is a convenience wrapper around
   * claimBribesToRecipientByTokenIdCallParameters for the common single-claim
   * case.
   *
   * @param options single recipient-based bribe-claim input
   */
  public static claimBribeToRecipientByTokenIdCallParameters(
    options: ClaimBribeToRecipientByTokenIdOptions,
  ): MethodParameters {
    return VeNFTClaims.claimBribesToRecipientByTokenIdCallParameters({
      tokenId: options.tokenId,
      recipient: options.recipient,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim bribes from one or more bribe contracts for a
   * veNFT and send the proceeds to a specific recipient.
   *
   * Use this when the bribe claim should be routed somewhere other than the
   * caller, such as a managed account or partner-controlled recipient.
   *
   * @param options bulk recipient-based bribe-claim input
   */
  public static claimBribesToRecipientByTokenIdCallParameters(
    options: ClaimBribesToRecipientByTokenIdOptions,
  ): MethodParameters {
    const { sourceAddresses, tokenAddresses } = VeNFTClaims.parseClaims(
      options.claims,
      claim => claim.bribeAddress,
    );
    const recipient = validateAndParseAddress(options.recipient);

    return {
      calldata: VeNFTClaims.INTERFACE.encodeFunctionData(
        'claimBribesToRecipientByTokenId(address[],address[][],uint256,address)',
        [sourceAddresses, tokenAddresses, toHex(options.tokenId), recipient],
      ),
      value: toHex(0),
    };
  }

  /**
   * Validates claim inputs and normalizes source/token addresses while
   * preserving the caller-provided claim and token order.
   */
  private static parseClaims<T extends { tokens: string[] }>(
    claims: T[],
    getSourceAddress: (claim: T) => string,
  ): ParsedClaims {
    invariant(claims.length > 0, 'EMPTY_CLAIMS');

    const sourceAddresses = claims.map(claim =>
      validateAndParseAddress(getSourceAddress(claim)),
    );
    const tokenAddresses = claims.map(claim => {
      invariant(claim.tokens.length > 0, 'EMPTY_CLAIM_TOKENS');
      return claim.tokens.map(token => validateAndParseAddress(token));
    });

    return { sourceAddresses, tokenAddresses };
  }
}

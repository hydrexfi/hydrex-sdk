import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { voterABI } from '../abis/voter';
import { ReadContractFunction } from '../types/contractReads';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface ClaimRewardsOptions {
  gaugeAddresses: string[];
}

export interface ClaimRewardsForOptions extends ClaimRewardsOptions {
  claimFor: string;
}

export interface RewardTokenClaimItem {
  gaugeAddress: string;
  tokens: string[];
}

export interface ClaimRewardTokenOptions {
  claim: RewardTokenClaimItem;
}

export interface ClaimRewardTokensOptions {
  claims: RewardTokenClaimItem[];
}

export interface ClaimRewardTokenForOptions {
  claimFor: string;
  claim: RewardTokenClaimItem;
}

export interface ClaimRewardTokensForOptions {
  claimFor: string;
  claims: RewardTokenClaimItem[];
}

export interface ClaimRewardTokenToRecipientOptions {
  claimFor: string;
  recipient: string;
  claim: RewardTokenClaimItem;
}

export interface ClaimRewardTokensToRecipientOptions {
  claimFor: string;
  recipient: string;
  claims: RewardTokenClaimItem[];
}

export interface GaugeRewardReadInput {
  gaugeAddress: string;
  readContract: ReadContractFunction;
  rewardTokenAddress?: string;
}

interface ParsedRewardTokenClaims {
  gaugeAddresses: string[];
  tokenAddresses: string[][];
}

/**
 * Helpers for building encoded calldata for gauge reward claims.
 *
 * Use these helpers when liquid / earn positions have claimable rewards and
 * you want to build the encoded transaction data before submitting it with
 * your own wallet or transaction flow.
 */
export abstract class ClaimRewards {
  public static INTERFACE: Interface = new Interface(voterABI);

  private constructor() {}

  /**
   * Reads the pending reward amount for an account from a single gauge.
   *
   * The helper first tries the single-argument earned(account) shape, then
   * falls back to earned(account, rewardToken) when a reward token address is
   * available.
   *
   * @param userAddress account to inspect
   * @param readContract injected read function bound to the gauge contract
   * @param rewardTokenAddress optional reward token address for 2-arg fallback
   */
  public static async getPendingReward(
    userAddress: string,
    readContract: ReadContractFunction,
    rewardTokenAddress?: string,
  ): Promise<bigint> {
    const normalizedUserAddress = validateAndParseAddress(userAddress);
    const normalizedRewardTokenAddress = rewardTokenAddress
      ? validateAndParseAddress(rewardTokenAddress)
      : undefined;

    try {
      return toBigInt(
        await readContract({
          functionName: 'earned',
          args: [normalizedUserAddress],
        }),
      );
    } catch (error) {
      if (
        !normalizedRewardTokenAddress ||
        !ClaimRewards.isUnsupportedEarnedSignatureError(error)
      ) {
        throw error;
      }
    }

    try {
      return toBigInt(
        await readContract({
          functionName: 'earned',
          args: [normalizedUserAddress, normalizedRewardTokenAddress],
        }),
      );
    } catch (error) {
      throw new Error(
        `Failed to read earned() from gauge: ${ClaimRewards.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * The gauge read surface is not perfectly uniform. Some gauges expose
   * earned(account), while others require earned(account, rewardToken).
   *
   * Only signature/ABI-style failures should fall through to the alternate
   * read shape. Unexpected RPC or execution errors should still surface to the
   * caller.
   */
  private static isUnsupportedEarnedSignatureError(error: unknown): boolean {
    const message = ClaimRewards.getErrorMessage(error).toLowerCase();

    return (
      message.includes('no matching fragment') ||
      message.includes('function selector was not recognized') ||
      message.includes('function does not exist') ||
      message.includes('does not have the function') ||
      message.includes('returned no data') ||
      message.includes('could not decode result data')
    );
  }

  private static getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Reads pending rewards across multiple gauges and returns the gauges that
   * currently have claimable rewards.
   *
   * The returned gauge list is ready to pass into claimRewardsCallParameters.
   *
   * @param userAddress account to inspect
   * @param gauges gauge read inputs bound to their respective contracts
   */
  public static async getClaimableGaugeAddresses(
    userAddress: string,
    gauges: GaugeRewardReadInput[],
  ): Promise<string[]> {
    if (gauges.length === 0) {
      return [];
    }

    const normalizedGauges = gauges.map((gauge) => ({
      gaugeAddress: validateAndParseAddress(gauge.gaugeAddress),
      readContract: gauge.readContract,
      rewardTokenAddress: gauge.rewardTokenAddress,
    }));
    const pendingRewards = await Promise.all(
      normalizedGauges.map((gauge) =>
        ClaimRewards.getPendingReward(
          userAddress,
          gauge.readContract,
          gauge.rewardTokenAddress,
        ),
      ),
    );

    return normalizedGauges
      .filter((_, index) => pendingRewards[index] > BigInt(0))
      .map((gauge) => gauge.gaugeAddress);
  }

  /**
   * Reads pending rewards across multiple gauges and returns reward-token claim
   * entries for the gauges that currently have claimable rewards.
   *
   * Use this when you want to build claimRewardTokens-style transactions after
   * discovering claimable rewards on the read side.
   *
   * @param userAddress account to inspect
   * @param gauges gauge read inputs bound to their respective contracts
   */
  public static async getClaimableRewardTokenClaims(
    userAddress: string,
    gauges: GaugeRewardReadInput[],
  ): Promise<RewardTokenClaimItem[]> {
    if (gauges.length === 0) {
      return [];
    }

    const gaugesWithRewardTokens = gauges
      .filter(
        (
          gauge,
        ): gauge is GaugeRewardReadInput & { rewardTokenAddress: string } =>
          Boolean(gauge.rewardTokenAddress),
      )
      .map((gauge) => ({
        gaugeAddress: validateAndParseAddress(gauge.gaugeAddress),
        readContract: gauge.readContract,
        rewardTokenAddress: validateAndParseAddress(gauge.rewardTokenAddress),
      }));

    if (gaugesWithRewardTokens.length === 0) {
      return [];
    }

    const claims = new Map<string, Set<string>>();

    const pendingRewards = await Promise.all(
      gaugesWithRewardTokens.map((gauge) =>
        ClaimRewards.getPendingReward(
          userAddress,
          gauge.readContract,
          gauge.rewardTokenAddress,
        ),
      ),
    );

    for (const [index, pendingReward] of pendingRewards.entries()) {
      if (pendingReward <= BigInt(0)) {
        continue;
      }

      const { gaugeAddress, rewardTokenAddress } = gaugesWithRewardTokens[index];
      const existingTokens = claims.get(gaugeAddress);
      if (existingTokens) {
        existingTokens.add(rewardTokenAddress);
        continue;
      }

      claims.set(gaugeAddress, new Set([rewardTokenAddress]));
    }

    return Array.from(claims.entries()).map(([gaugeAddress, tokens]) => ({
      gaugeAddress,
      tokens: Array.from(tokens),
    }));
  }

  /**
   * Builds calldata to claim rewards from one or more gauges.
   *
   * Pass one gauge address per reward source. The order of gauges is preserved.
   *
   * @param options bulk gauge reward-claim input
   */
  public static claimRewardsCallParameters(
    options: ClaimRewardsOptions,
  ): MethodParameters {
    const gaugeAddresses = ClaimRewards.parseGaugeAddresses(
      options.gaugeAddresses,
    );

    return {
      calldata: ClaimRewards.INTERFACE.encodeFunctionData('claimRewards', [
        gaugeAddresses,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim rewards from one or more gauges for a specific
   * address.
   *
   * Use this when the rewards should be claimed on behalf of another address.
   *
   * @param options bulk gauge reward-claim input with delegated recipient
   */
  public static claimRewardsForCallParameters(
    options: ClaimRewardsForOptions,
  ): MethodParameters {
    const gaugeAddresses = ClaimRewards.parseGaugeAddresses(
      options.gaugeAddresses,
    );
    const claimFor = validateAndParseAddress(options.claimFor);

    return {
      calldata: ClaimRewards.INTERFACE.encodeFunctionData('claimRewardsFor', [
        gaugeAddresses,
        claimFor,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim specific reward tokens from a single gauge.
   *
   * This is a convenience wrapper around claimRewardTokensCallParameters for
   * the common single-claim case.
   *
   * @param options single gauge reward-token claim input
   */
  public static claimRewardTokenCallParameters(
    options: ClaimRewardTokenOptions,
  ): MethodParameters {
    return ClaimRewards.claimRewardTokensCallParameters({
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim specific reward tokens from one or more gauges.
   *
   * Pass one claim entry per gauge, along with the token addresses to claim
   * from that gauge. The order of gauges and tokens is preserved.
   *
   * @param options bulk gauge reward-token claim input
   */
  public static claimRewardTokensCallParameters(
    options: ClaimRewardTokensOptions,
  ): MethodParameters {
    const { gaugeAddresses, tokenAddresses } =
      ClaimRewards.parseRewardTokenClaims(options.claims);

    return {
      calldata: ClaimRewards.INTERFACE.encodeFunctionData('claimRewardTokens', [
        gaugeAddresses,
        tokenAddresses,
      ]),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim specific reward tokens from a single gauge for a
   * specific address.
   *
   * This is a convenience wrapper around claimRewardTokensForCallParameters for
   * the common single-claim case.
   *
   * @param options single delegated gauge reward-token claim input
   */
  public static claimRewardTokenForCallParameters(
    options: ClaimRewardTokenForOptions,
  ): MethodParameters {
    return ClaimRewards.claimRewardTokensForCallParameters({
      claimFor: options.claimFor,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim specific reward tokens from one or more gauges for
   * a specific address.
   *
   * Use this when the reward tokens should be claimed on behalf of another
   * address.
   *
   * @param options bulk delegated gauge reward-token claim input
   */
  public static claimRewardTokensForCallParameters(
    options: ClaimRewardTokensForOptions,
  ): MethodParameters {
    const { gaugeAddresses, tokenAddresses } =
      ClaimRewards.parseRewardTokenClaims(options.claims);
    const claimFor = validateAndParseAddress(options.claimFor);

    return {
      calldata: ClaimRewards.INTERFACE.encodeFunctionData(
        'claimRewardTokensFor',
        [gaugeAddresses, tokenAddresses, claimFor],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to claim specific reward tokens from a single gauge for a
   * specific address and send them to a recipient.
   *
   * This is a convenience wrapper around
   * claimRewardTokensToRecipientCallParameters for the common single-claim
   * case.
   *
   * @param options single recipient-routed reward-token claim input
   */
  public static claimRewardTokenToRecipientCallParameters(
    options: ClaimRewardTokenToRecipientOptions,
  ): MethodParameters {
    return ClaimRewards.claimRewardTokensToRecipientCallParameters({
      claimFor: options.claimFor,
      recipient: options.recipient,
      claims: [options.claim],
    });
  }

  /**
   * Builds calldata to claim specific reward tokens from one or more gauges for
   * a specific address and send them to a recipient.
   *
   * Use this when the reward token claim should be routed somewhere other than
   * the caller.
   *
   * @param options bulk recipient-routed reward-token claim input
   */
  public static claimRewardTokensToRecipientCallParameters(
    options: ClaimRewardTokensToRecipientOptions,
  ): MethodParameters {
    const { gaugeAddresses, tokenAddresses } =
      ClaimRewards.parseRewardTokenClaims(options.claims);
    const claimFor = validateAndParseAddress(options.claimFor);
    const recipient = validateAndParseAddress(options.recipient);

    return {
      calldata: ClaimRewards.INTERFACE.encodeFunctionData(
        'claimRewardTokensToRecipient',
        [gaugeAddresses, tokenAddresses, claimFor, recipient],
      ),
      value: toHex(0),
    };
  }

  /**
   * Validates gauge reward-claim inputs and normalizes gauge addresses while
   * preserving the caller-provided order.
   */
  private static parseGaugeAddresses(gaugeAddresses: string[]): string[] {
    invariant(gaugeAddresses.length > 0, 'EMPTY_GAUGES');

    return gaugeAddresses.map(gaugeAddress =>
      validateAndParseAddress(gaugeAddress),
    );
  }

  /**
   * Validates reward-token claim inputs and normalizes gauge/token addresses
   * while preserving the caller-provided claim and token order.
   */
  private static parseRewardTokenClaims(
    claims: RewardTokenClaimItem[],
  ): ParsedRewardTokenClaims {
    invariant(claims.length > 0, 'EMPTY_CLAIMS');

    const gaugeAddresses = claims.map(claim =>
      validateAndParseAddress(claim.gaugeAddress),
    );
    const tokenAddresses = claims.map(claim => {
      invariant(claim.tokens.length > 0, 'EMPTY_CLAIM_TOKENS');
      return claim.tokens.map(token => validateAndParseAddress(token));
    });

    return { gaugeAddresses, tokenAddresses };
  }
}

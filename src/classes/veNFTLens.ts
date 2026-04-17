import { Interface } from '@ethersproject/abi';
import { veTokenLensABI } from '../abis/veTokenLens';
import { ADDRESS_ZERO } from '../constants/constants';
import { BigintIsh } from '../types/BigIntish';
import {
  ReadContractFunction,
  ReadContractsFunction,
} from '../types/contractReads';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';
import { BribeClaimItem, FeeClaimItem } from './veNFTClaims';

export interface VeTokenLensReward {
  id: bigint;
  amount: bigint;
  decimals: number;
  pair: string;
  token: string;
  fee: string;
  bribe: string;
  symbol: string;
}

export interface VeNFTClaimable {
  fees: FeeClaimItem[];
  bribes: BribeClaimItem[];
}

/**
 * Helpers for reading veNFT reward state from the VeTokenLens contract.
 *
 * Use these helpers when you need to discover which fee or bribe claims are
 * available for a veNFT before building claim transactions with VeNFTClaims.
 */
export abstract class VeNFTLens {
  public static INTERFACE: Interface = new Interface(
    veTokenLensABI as unknown as any[],
  );

  private constructor() {}

  /**
   * Reads the reward entries for a single voted pair from VeTokenLens.
   *
   * Use this when you already know the pair you want to inspect and need the
   * raw fee/bribe reward entries tied to that pair.
   *
   * @param tokenId veNFT token id to inspect
   * @param pairAddress pair or strategy address to query
   * @param readContract injected read function bound to the VeTokenLens contract
   */
  public static async getSinglePairReward(
    tokenId: BigintIsh,
    pairAddress: string,
    readContract: ReadContractFunction,
  ): Promise<VeTokenLensReward[]> {
    const normalizedPairAddress = validateAndParseAddress(pairAddress);
    const result = await readContract<unknown[]>({
      functionName: 'singlePairReward',
      args: [toBigInt(tokenId), normalizedPairAddress],
    });

    return (result ?? []).map(reward => VeNFTLens.parseReward(reward));
  }

  /**
   * Reads and classifies all claimable rewards for a veNFT across multiple
   * voted pairs.
   *
   * The returned fee and bribe items are already shaped to pass directly into
   * VeNFTClaims claim builders.
   *
   * @param tokenId veNFT token id to inspect
   * @param pairAddresses voted pair or strategy addresses to query
   * @param readContracts injected batch read function bound to VeTokenLens
   */
  public static async getAllClaimable(
    tokenId: BigintIsh,
    pairAddresses: string[],
    readContracts: ReadContractsFunction,
  ): Promise<VeNFTClaimable> {
    if (pairAddresses.length === 0) {
      return { fees: [], bribes: [] };
    }

    const normalizedTokenId = toBigInt(tokenId);
    const normalizedPairAddresses = pairAddresses.map(address =>
      validateAndParseAddress(address),
    );

    const results = await readContracts(
      normalizedPairAddresses.map(pairAddress => ({
        functionName: 'singlePairReward',
        args: [normalizedTokenId, pairAddress],
      })),
    );

    const fees = new Map<string, Set<string>>();
    const bribes = new Map<string, Set<string>>();

    results.forEach(result => {
      const rewards = Array.isArray(result) ? result : [];

      rewards.forEach(rewardResult => {
        const reward = VeNFTLens.parseReward(rewardResult);

        if (reward.amount <= BigInt(0)) {
          return;
        }

        if (reward.bribe !== ADDRESS_ZERO) {
          VeNFTLens.appendClaim(bribes, reward.bribe, reward.token);
          return;
        }

        if (reward.fee !== ADDRESS_ZERO) {
          VeNFTLens.appendClaim(fees, reward.fee, reward.token);
        }
      });
    });

    return {
      fees: Array.from(fees.entries()).map(([feeAddress, tokens]) => ({
        feeAddress,
        tokens: Array.from(tokens),
      })),
      bribes: Array.from(bribes.entries()).map(([bribeAddress, tokens]) => ({
        bribeAddress,
        tokens: Array.from(tokens),
      })),
    };
  }

  /**
   * Normalizes a raw VeTokenLens reward entry into the SDK reward shape.
   */
  private static parseReward(reward: unknown): VeTokenLensReward {
    const rawReward = reward as {
      id: unknown;
      amount: unknown;
      decimals: unknown;
      pair: unknown;
      token: unknown;
      fee: unknown;
      bribe: unknown;
      symbol: unknown;
    };

    return {
      id: toBigInt(rawReward.id),
      amount: toBigInt(rawReward.amount),
      decimals: Number(rawReward.decimals),
      pair: validateAndParseAddress(String(rawReward.pair)),
      token: validateAndParseAddress(String(rawReward.token)),
      fee: validateAndParseAddress(String(rawReward.fee)),
      bribe: validateAndParseAddress(String(rawReward.bribe)),
      symbol: String(rawReward.symbol),
    };
  }

  /**
   * Adds a token to an aggregated claim entry while preserving discovery order.
   */
  private static appendClaim(
    claims: Map<string, Set<string>>,
    sourceAddress: string,
    tokenAddress: string,
  ): void {
    const existing = claims.get(sourceAddress);

    if (existing) {
      existing.add(tokenAddress);
      return;
    }

    claims.set(sourceAddress, new Set([tokenAddress]));
  }
}

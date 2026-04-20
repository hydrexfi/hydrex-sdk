import { Interface } from '@ethersproject/abi';
import { formatUnits } from '@ethersproject/units';
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

export interface SnapshotVote {
  pair: string;
  weight: bigint;
  weightFormatted: string;
  percent: number;
}

export interface VeNFTAccountVote {
  pair: string;
  weight: bigint;
}

export interface VeNFTAccount {
  tokenId: bigint;
  amount: bigint;
  decimals: number;
  voted: boolean;
  attachments: bigint;
  votingPower: bigint;
  earningPower: bigint;
  rebaseAmount: bigint;
  lockEnd: bigint;
  voteTs: bigint;
  votes: VeNFTAccountVote[];
  account: string;
  delegatee: string;
  payoutToken: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export interface VeNFTAccountsByAddress {
  owner: string;
  balance: number;
  accounts: VeNFTAccount[];
}

export interface UserVoteSnapshot {
  voted: boolean;
  votingPower: string;
  rawVotingPower: bigint;
  earningPower: string;
  rawEarningPower: bigint;
  epochVotes: string;
  rawEpochVotes: bigint;
  nextEpochVotes: string;
  rawNextEpochVotes: bigint;
  nextEarningPower: string;
  rawNextEarningPower: bigint;
  voteTs: number;
  rawVoteTs: bigint;
  votes: SnapshotVote[];
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
   * Reads the current vote snapshot for a user directly from VeTokenLens.
   *
   * This richer snapshot should be preferred when the caller needs the user's
   * current saved votes, vote timestamp, and epoch-level voting totals in one read.
   *
   * @param owner wallet address to inspect
   * @param readContract injected read function bound to the VeTokenLens contract
   */
  public static async getUserVoteSnapshot(
    owner: string,
    readContract: ReadContractFunction,
  ): Promise<UserVoteSnapshot> {
    const result = await readContract({
      functionName: 'getVotesFromAddress',
      args: [validateAndParseAddress(owner)],
    });

    return VeNFTLens.parseUserVoteSnapshot(result);
  }

  /**
   * Reads the current vote snapshot for a single veNFT token id from VeTokenLens.
   *
   * Use this when the caller needs the vote breakdown for one specific veNFT
   * rather than the wallet-level aggregate returned by `getUserVoteSnapshot`.
   *
   * @param tokenId veNFT token id to inspect
   * @param readContract injected read function bound to the VeTokenLens contract
   */
  public static async getUserVoteSnapshotByTokenId(
    tokenId: BigintIsh,
    readContract: ReadContractFunction,
  ): Promise<UserVoteSnapshot> {
    const result = await readContract({
      functionName: 'getNFTFromId',
      args: [toBigInt(tokenId)],
    });

    return VeNFTLens.parseUserVoteSnapshotFromAccount(result);
  }

  /**
   * Reads the veNFT accounts currently associated with an owner address.
   *
   * This is a normalized raw lens view of the owner's accounts. It intentionally
   * excludes the heavier app-side enrichments such as conduits, names, or epoch
   * reward timing.
   *
   * @param owner wallet address to inspect
   * @param readContract injected read function bound to the VeTokenLens contract
   */
  public static async getAccountsByAddress(
    owner: string,
    readContract: ReadContractFunction,
  ): Promise<VeNFTAccountsByAddress> {
    const normalizedOwner = validateAndParseAddress(owner);
    const result = await readContract<unknown[]>({
      functionName: 'getNFTFromAddress',
      args: [normalizedOwner],
    });
    const accounts = (result ?? []).map(account =>
      VeNFTLens.parseVeNFTAccount(account),
    );

    return {
      owner: normalizedOwner,
      balance: accounts.length,
      accounts,
    };
  }

  /**
   * Reads a single veNFT account by token id from VeTokenLens.
   *
   * @param tokenId veNFT token id to inspect
   * @param readContract injected read function bound to the VeTokenLens contract
   */
  public static async getAccountById(
    tokenId: BigintIsh,
    readContract: ReadContractFunction,
  ): Promise<VeNFTAccount> {
    const result = await readContract({
      functionName: 'getNFTFromId',
      args: [toBigInt(tokenId)],
    });

    return VeNFTLens.parseVeNFTAccount(result);
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
   * Normalizes a raw VeTokenLens vote snapshot into the SDK vote snapshot shape.
   */
  private static parseUserVoteSnapshot(result: unknown): UserVoteSnapshot {
    const rawResult = result as {
      voted: unknown;
      epochVotes: unknown;
      nextEpochVotes: unknown;
      nextEarningPower: unknown;
      voteTs: unknown;
      votes: unknown;
    };
    const rawEpochVotes = toBigInt(rawResult.epochVotes);
    const rawVotingPower = rawEpochVotes;
    const rawEarningPower = (rawEpochVotes * BigInt(13)) / BigInt(10);
    const rawNextEpochVotes = toBigInt(rawResult.nextEpochVotes);
    const rawNextEarningPower = toBigInt(rawResult.nextEarningPower);
    const rawVoteTs = toBigInt(rawResult.voteTs);
    const parsedVotes = Array.isArray(rawResult.votes)
      ? rawResult.votes.map(vote => VeNFTLens.parseSnapshotVote(vote))
      : [];
    const totalVoteWeight = parsedVotes.reduce(
      (sum, vote) => sum + vote.weight,
      BigInt(0),
    );

    return {
      voted: Boolean(rawResult.voted) && parsedVotes.length > 0,
      votingPower: formatUnits(rawVotingPower, 18),
      rawVotingPower,
      earningPower: formatUnits(rawEarningPower, 18),
      rawEarningPower,
      epochVotes: formatUnits(rawEpochVotes, 18),
      rawEpochVotes,
      nextEpochVotes: formatUnits(rawNextEpochVotes, 18),
      rawNextEpochVotes,
      nextEarningPower: formatUnits(rawNextEarningPower, 18),
      rawNextEarningPower,
      voteTs: Number(rawVoteTs),
      rawVoteTs,
      votes: parsedVotes.map(vote => ({
        ...vote,
        percent:
          totalVoteWeight > BigInt(0)
            ? Math.round(
                (Number(vote.weight) / Number(totalVoteWeight)) * 10000,
              ) / 100
            : 0,
      })),
    };
  }

  /**
   * Normalizes a raw single-veNFT lens payload into the SDK vote snapshot shape.
   */
  private static parseUserVoteSnapshotFromAccount(
    account: unknown,
  ): UserVoteSnapshot {
    const rawAccount = account as {
      voted: unknown;
      voting_amount: unknown;
      earning_power: unknown;
      vote_ts: unknown;
      votes: unknown;
    };
    const rawVotingPower = toBigInt(rawAccount.voting_amount);
    const rawEarningPower = toBigInt(rawAccount.earning_power);
    const rawVoteTs = toBigInt(rawAccount.vote_ts);
    const parsedVotes = Array.isArray(rawAccount.votes)
      ? rawAccount.votes.map(vote => VeNFTLens.parseSnapshotVote(vote))
      : [];
    const totalVoteWeight = parsedVotes.reduce(
      (sum, vote) => sum + vote.weight,
      BigInt(0),
    );

    return {
      voted: Boolean(rawAccount.voted) && parsedVotes.length > 0,
      votingPower: formatUnits(rawVotingPower, 18),
      rawVotingPower,
      earningPower: formatUnits(rawEarningPower, 18),
      rawEarningPower,
      epochVotes: formatUnits(rawVotingPower, 18),
      rawEpochVotes: rawVotingPower,
      nextEpochVotes: formatUnits(rawVotingPower, 18),
      rawNextEpochVotes: rawVotingPower,
      nextEarningPower: formatUnits(rawEarningPower, 18),
      rawNextEarningPower: rawEarningPower,
      voteTs: Number(rawVoteTs),
      rawVoteTs,
      votes: parsedVotes.map(vote => ({
        ...vote,
        percent:
          totalVoteWeight > BigInt(0)
            ? Math.round(
                (Number(vote.weight) / Number(totalVoteWeight)) * 10000,
              ) / 100
            : 0,
      })),
    };
  }

  /**
   * Normalizes a raw vote row from VeTokenLens into the SDK vote row shape.
   */
  private static parseSnapshotVote(vote: unknown): SnapshotVote {
    const rawVote = vote as {
      pair: unknown;
      weight: unknown;
    };
    const weight = toBigInt(rawVote.weight);

    return {
      pair: validateAndParseAddress(String(rawVote.pair)),
      weight,
      weightFormatted: formatUnits(weight, 18),
      percent: 0,
    };
  }

  /**
   * Normalizes a raw VeTokenLens account payload into the SDK account shape.
   */
  private static parseVeNFTAccount(account: unknown): VeNFTAccount {
    const rawAccount = account as {
      decimals: unknown;
      voted: unknown;
      attachments: unknown;
      id: unknown;
      amount: unknown;
      voting_amount: unknown;
      earning_power: unknown;
      rebase_amount: unknown;
      lockEnd: unknown;
      vote_ts: unknown;
      votes: unknown;
      account: unknown;
      delegatee: unknown;
      token: unknown;
      tokenSymbol: unknown;
      tokenDecimals: unknown;
    };

    return {
      tokenId: toBigInt(rawAccount.id),
      amount: toBigInt(rawAccount.amount),
      decimals: Number(rawAccount.decimals ?? 18),
      voted: Boolean(rawAccount.voted),
      attachments: toBigInt(rawAccount.attachments),
      votingPower: toBigInt(rawAccount.voting_amount),
      earningPower: toBigInt(rawAccount.earning_power),
      rebaseAmount: toBigInt(rawAccount.rebase_amount),
      lockEnd: toBigInt(rawAccount.lockEnd),
      voteTs: toBigInt(rawAccount.vote_ts),
      votes: Array.isArray(rawAccount.votes)
        ? rawAccount.votes.map(vote => VeNFTLens.parseVeNFTAccountVote(vote))
        : [],
      account: validateAndParseAddress(String(rawAccount.account ?? ADDRESS_ZERO)),
      delegatee: validateAndParseAddress(
        String(rawAccount.delegatee ?? ADDRESS_ZERO),
      ),
      payoutToken: validateAndParseAddress(String(rawAccount.token ?? ADDRESS_ZERO)),
      tokenSymbol:
        typeof rawAccount.tokenSymbol === 'string'
          ? rawAccount.tokenSymbol
          : undefined,
      tokenDecimals:
        rawAccount.tokenDecimals !== undefined
          ? Number(rawAccount.tokenDecimals)
          : undefined,
    };
  }

  /**
   * Normalizes a raw VeTokenLens account vote row.
   */
  private static parseVeNFTAccountVote(vote: unknown): VeNFTAccountVote {
    const rawVote = vote as {
      pair: unknown;
      weight: unknown;
    };

    return {
      pair: validateAndParseAddress(String(rawVote.pair)),
      weight: toBigInt(rawVote.weight),
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

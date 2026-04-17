import { Interface } from '@ethersproject/abi';
import { gaugeABI } from '../abis/gauge';
import { BigintIsh } from '../types/BigIntish';
import { ReadContractFunction, ReadContractsFunction } from '../types/contractReads';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface GaugeUserState {
  staked: bigint;
  pendingReward: bigint;
}

/**
 * Represents a Hydrex gauge contract and provides static helpers for
 * building calldata (writes) and reading on-chain state (reads).
 *
 * Write methods return encoded calldata that apps can pass directly to a
 * wallet transaction. Read methods accept an injected readContract /
 * readContracts function so the caller controls the transport layer.
 */
export abstract class Gauge {
  public static INTERFACE: Interface = new Interface(gaugeABI as unknown as any[]);

  private constructor() {}

  // ── Write: calldata builders ──────────────────────────────────────────

  /**
   * Encodes a deposit(amount) call.
   */
  public static depositCallParameters(amount: BigintIsh): MethodParameters {
    return {
      calldata: Gauge.INTERFACE.encodeFunctionData('deposit', [toBigInt(amount)]),
      value: toHex(0),
    };
  }

  /**
   * Encodes a depositAll() call — stakes the caller's full token balance.
   */
  public static depositAllCallParameters(): MethodParameters {
    return {
      calldata: Gauge.INTERFACE.encodeFunctionData('depositAll', []),
      value: toHex(0),
    };
  }

  /**
   * Encodes a withdraw(amount) call.
   */
  public static withdrawCallParameters(amount: BigintIsh): MethodParameters {
    return {
      calldata: Gauge.INTERFACE.encodeFunctionData('withdraw', [toBigInt(amount)]),
      value: toHex(0),
    };
  }

  /**
   * Encodes a withdrawAllAndHarvest() call — unstakes everything and claims
   * all pending rewards in a single transaction.
   */
  public static withdrawAllAndHarvestCallParameters(): MethodParameters {
    return {
      calldata: Gauge.INTERFACE.encodeFunctionData('withdrawAllAndHarvest', []),
      value: toHex(0),
    };
  }

  /**
   * Encodes a getReward() call.
   *
   * Three overloads:
   *   - `getRewardCallParameters()` — claims for the caller
   *   - `getRewardCallParameters(user)` — claims on behalf of a user
   *   - `getRewardCallParameters(user, tokens)` — claims specific reward tokens for a user
   */
  public static getRewardCallParameters(): MethodParameters;
  public static getRewardCallParameters(user: string): MethodParameters;
  public static getRewardCallParameters(user: string, tokens: string[]): MethodParameters;
  public static getRewardCallParameters(user?: string, tokens?: string[]): MethodParameters {
    let calldata: string;
    if (!user) {
      // Use full signature to disambiguate from overloads (ethers.js v5 requirement)
      calldata = Gauge.INTERFACE.encodeFunctionData('getReward()', []);
    } else if (!tokens) {
      calldata = Gauge.INTERFACE.encodeFunctionData('getReward(address)', [
        validateAndParseAddress(user),
      ]);
    } else {
      calldata = Gauge.INTERFACE.encodeFunctionData('getReward(address,address[])', [
        validateAndParseAddress(user),
        tokens.map(validateAndParseAddress),
      ]);
    }
    return { calldata, value: toHex(0) };
  }

  // ── Read: injected contract reads ────────────────────────────────────

  /**
   * Returns the caller's staked balance (shares).
   * @param user address to query
   * @param readContract function bound to the gauge address
   */
  public static async getUserStaked(
    user: string,
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    return toBigInt(
      await readContract({
        functionName: 'balanceOf',
        args: [validateAndParseAddress(user)],
      }),
    );
  }

  /**
   * Returns pending reward for the user.
   * When rewardToken is omitted, calls earned(user).
   * When rewardToken is provided, calls earned(user, rewardToken).
   * @param user address to query
   * @param readContract function bound to the gauge address
   * @param rewardToken optional reward token address for the two-arg overload
   */
  public static async getPendingReward(
    user: string,
    readContract: ReadContractFunction,
    rewardToken?: string,
  ): Promise<bigint> {
    const owner = validateAndParseAddress(user);
    if (!rewardToken) {
      return toBigInt(await readContract({ functionName: 'earned', args: [owner] }));
    }
    return toBigInt(
      await readContract({
        functionName: 'earned',
        args: [owner, validateAndParseAddress(rewardToken)],
      }),
    );
  }

  /**
   * Returns staked balance and pending reward in a single batched call.
   * @param user address to query
   * @param rewardToken reward token address for earned(user, rewardToken)
   * @param readContracts function bound to the gauge address
   */
  public static async getUserState(
    user: string,
    rewardToken: string,
    readContracts: ReadContractsFunction,
  ): Promise<GaugeUserState> {
    const owner = validateAndParseAddress(user);
    const reward = validateAndParseAddress(rewardToken);
    const [stakedResult, rewardResult] = await readContracts([
      { functionName: 'balanceOf', args: [owner] },
      { functionName: 'earned', args: [owner, reward] },
    ]);
    return {
      staked: toBigInt(stakedResult),
      pendingReward: toBigInt(rewardResult),
    };
  }

  /**
   * Returns the gauge's total staked supply.
   * @param readContract function bound to the gauge address
   */
  public static async getTotalSupply(readContract: ReadContractFunction): Promise<bigint> {
    return toBigInt(await readContract({ functionName: 'totalSupply' }));
  }

  /**
   * Returns the address of the token that must be approved before depositing.
   * @param readContract function bound to the gauge address
   */
  public static async getStakeToken(readContract: ReadContractFunction): Promise<string> {
    return validateAndParseAddress(String(await readContract({ functionName: 'stakeToken' })));
  }
}

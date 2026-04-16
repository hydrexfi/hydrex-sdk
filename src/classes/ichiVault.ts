import { Interface } from '@ethersproject/abi';
import invariant from 'tiny-invariant';
import { ichiVaultABI } from '../abis/ichiVault';
import { BigintIsh } from '../types/BigIntish';
import { ReadContractsFunction } from '../types/contractReads';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface IchiVaultInfo {
  /** Address of pool token0. */
  token0: string;
  /** Address of pool token1. */
  token1: string;
  /** Whether the vault accepts deposits of token0. */
  allowToken0: boolean;
  /** Whether the vault accepts deposits of token1. */
  allowToken1: boolean;
  /** Per-transaction deposit cap for token0 in token wei. Zero when deposits are paused. */
  deposit0Max: bigint;
  /** Per-transaction deposit cap for token1 in token wei. Zero when deposits are paused. */
  deposit1Max: bigint;
  /** Total outstanding vault LP share supply. */
  totalSupply: bigint;
  /** Current token0 reserves held by the vault. */
  total0: bigint;
  /** Current token1 reserves held by the vault. */
  total1: bigint;
  /** Vault fee in basis points. */
  fee: bigint;
}

export interface IchiWithdrawEstimate {
  /** Minimum token0 amount to use as minAmount0 in the withdraw call. */
  amount0: bigint;
  /** Minimum token1 amount to use as minAmount1 in the withdraw call. */
  amount1: bigint;
}

/**
 * Helpers for reading state from an Ichi vault contract and computing
 * fallback estimates for deposits and withdrawals.
 *
 * The vault contract is only used for read calls. All user transactions
 * (deposits and withdrawals) must target the IchiVaultDepositGuard contract.
 */
export abstract class IchiVault {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static INTERFACE: Interface = new Interface(ichiVaultABI as unknown as any[]);

  private constructor() {}

  /**
   * Reads all relevant vault state in a single batched call.
   * The provided readContracts function must be bound to the specific vault address.
   * @param readContracts injected batch read function bound to the vault contract
   */
  public static async getVaultInfo(
    readContracts: ReadContractsFunction,
  ): Promise<IchiVaultInfo> {
    const [
      token0Result,
      token1Result,
      allowToken0Result,
      allowToken1Result,
      deposit0MaxResult,
      deposit1MaxResult,
      totalSupplyResult,
      totalAmountsResult,
      feeResult,
    ] = await readContracts([
      { functionName: 'token0' },
      { functionName: 'token1' },
      { functionName: 'allowToken0' },
      { functionName: 'allowToken1' },
      { functionName: 'deposit0Max' },
      { functionName: 'deposit1Max' },
      { functionName: 'totalSupply' },
      { functionName: 'getTotalAmounts' },
      { functionName: 'fee' },
    ]);

    const [total0Raw, total1Raw] = totalAmountsResult as [unknown, unknown];

    return {
      token0: validateAndParseAddress(String(token0Result)),
      token1: validateAndParseAddress(String(token1Result)),
      allowToken0: Boolean(allowToken0Result),
      allowToken1: Boolean(allowToken1Result),
      deposit0Max: toBigInt(deposit0MaxResult),
      deposit1Max: toBigInt(deposit1MaxResult),
      totalSupply: toBigInt(totalSupplyResult),
      total0: toBigInt(total0Raw),
      total1: toBigInt(total1Raw),
      fee: toBigInt(feeResult),
    };
  }

  /**
   * Returns true when the vault has paused deposits (both per-tx caps are zero).
   * @param info vault info returned by getVaultInfo
   */
  public static isDepositsPaused(info: IchiVaultInfo): boolean {
    return info.deposit0Max === BigInt(0) && info.deposit1Max === BigInt(0);
  }

  /**
   * Estimates minimum LP shares to request using the proportional fallback formula:
   *   expectedShares = (depositAmountUSD / vaultTVLUSD) * totalSupply
   *
   * Use this when on-chain simulation is unavailable. The result has slippage
   * already applied — pass it directly as `minimumProceeds` in the deposit call.
   * A minimum slippage floor of 500 bips (5%) is enforced in fallback mode.
   *
   * When on-chain simulation is available, simulate with minimumProceeds = 0,
   * then call applySlippage() on the simulated result instead.
   *
   * @param depositAmountUSD deposit value in USD
   * @param vaultTVLUSD total vault TVL in USD (token0USD + token1USD)
   * @param totalSupply current total LP share supply from getVaultInfo
   * @param slippageBps slippage tolerance in basis points (e.g. 50 = 0.5%). Floored at 500.
   */
  public static estimateDepositShares(
    depositAmountUSD: number,
    vaultTVLUSD: number,
    totalSupply: BigintIsh,
    slippageBps: number,
  ): bigint {
    invariant(vaultTVLUSD > 0, 'ZERO_TVL');
    invariant(depositAmountUSD >= 0, 'NEGATIVE_DEPOSIT');

    const effectiveSlippageBps = Math.max(slippageBps, 500);
    const supply = toBigInt(totalSupply);

    // Scale USD values by 1e9 to preserve precision through integer division.
    const scaledDeposit = BigInt(Math.round(depositAmountUSD * 1e9));
    const scaledTVL = BigInt(Math.round(vaultTVLUSD * 1e9));
    const expectedShares = (scaledDeposit * supply) / scaledTVL;

    return (expectedShares * BigInt(10000 - effectiveSlippageBps)) / BigInt(10000);
  }

  /**
   * Estimates minimum token amounts to request using the proportional fallback formula:
   *   amount0 = (shares * total0) / totalSupply
   *   amount1 = (shares * total1) / totalSupply
   *
   * Use this when on-chain simulation is unavailable. The result has slippage
   * already applied — pass amount0/amount1 directly as minAmount0/minAmount1
   * in the withdraw call. A minimum slippage floor of 500 bips (5%) is enforced.
   *
   * When on-chain simulation is available, simulate with minAmount0 = minAmount1 = 0,
   * then call applySlippage() on each simulated output instead.
   *
   * @param shares vault LP share tokens to burn
   * @param total0 current token0 reserves from getVaultInfo
   * @param total1 current token1 reserves from getVaultInfo
   * @param totalSupply current total LP share supply from getVaultInfo
   * @param slippageBps slippage tolerance in basis points. Floored at 500.
   */
  public static estimateWithdrawAmounts(
    shares: BigintIsh,
    total0: BigintIsh,
    total1: BigintIsh,
    totalSupply: BigintIsh,
    slippageBps: number,
  ): IchiWithdrawEstimate {
    const supply = toBigInt(totalSupply);
    invariant(supply > BigInt(0), 'ZERO_SUPPLY');

    const effectiveSlippageBps = Math.max(slippageBps, 500);
    const multiplier = BigInt(10000 - effectiveSlippageBps);
    const sharesToBurn = toBigInt(shares);

    const rawAmount0 = (sharesToBurn * toBigInt(total0)) / supply;
    const rawAmount1 = (sharesToBurn * toBigInt(total1)) / supply;

    return {
      amount0: (rawAmount0 * multiplier) / BigInt(10000),
      amount1: (rawAmount1 * multiplier) / BigInt(10000),
    };
  }

  /**
   * Applies slippage to a simulated output (shares or token amount) to produce
   * the on-chain minimum. Use after a successful simulation call.
   *
   * minimumAmount = simulatedAmount * (10000 - slippageBps) / 10000
   *
   * @param simulatedAmount simulated output from a static call with 0 minimums
   * @param slippageBps slippage tolerance in basis points (e.g. 50 = 0.5%)
   */
  public static applySlippage(
    simulatedAmount: BigintIsh,
    slippageBps: number,
  ): bigint {
    return (
      (toBigInt(simulatedAmount) * BigInt(10000 - slippageBps)) / BigInt(10000)
    );
  }
}

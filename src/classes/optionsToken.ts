import { Interface } from '@ethersproject/abi';
import { optionsTokenABI } from '../abis/optionsToken';
import { veTokenABI } from '../abis/veToken';
import { BigintIsh } from '../types/BigIntish';
import { ReadContractFunction, ReadContractsFunction } from '../types/contractReads';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface OptionsTokenInfo {
  discount: bigint;
  twapSeconds: number;
  paymentToken: string;
  underlyingToken: string;
  isPaused: boolean;
}

export interface ExerciseQuote {
  amount: bigint;
  paymentAmount: bigint;
  twapAmount: bigint;
  paymentToken: string;
}

export interface ExerciseToLiquidHydxOptions {
  amount: BigintIsh;
  maxPaymentAmount: BigintIsh;
  recipient: string;
  deadlineSeconds?: number;
}

export interface ExerciseToProtocolAccountOptions {
  amount: BigintIsh;
  recipient: string;
}

export interface ExerciseToProtocolAccountAndMergeOptions
  extends ExerciseToProtocolAccountOptions {
  nextVeTokenId: BigintIsh;
  targetTokenId: BigintIsh;
}

/**
 * Helpers for reading oHYDX option-token conversion state and building the
 * calldata needed for both liquid HYDX and protocol-account exercise flows.
 *
 * In product terms:
 * - `exercise` converts oHYDX into liquid HYDX and requires a payment token
 *   such as USDC.
 * - `exerciseVe` converts oHYDX into a new locked protocol account.
 * - `exerciseVe` + `merge` converts into a new protocol account, then merges
 *   that new veNFT into an existing protocol account.
 */
export abstract class OptionsToken {
  public static OPTIONS_TOKEN_INTERFACE: Interface = new Interface(
    optionsTokenABI as unknown as any[],
  );

  public static VE_TOKEN_INTERFACE: Interface = new Interface(
    veTokenABI as unknown as any[],
  );

  private constructor() {}

  /**
   * Reads the current options-token configuration needed for oHYDX exercise
   * flows, including the payment token, underlying token, discount, and
   * paused state.
   *
   * @param readContracts injected batch read function bound to the options token
   */
  public static async getOptionsTokenInfo(
    readContracts: ReadContractsFunction,
  ): Promise<OptionsTokenInfo> {
    const [
      discountResult,
      twapSecondsResult,
      paymentTokenResult,
      underlyingTokenResult,
      isPausedResult,
    ] = await readContracts([
      { functionName: 'discount' },
      { functionName: 'twapSeconds' },
      { functionName: 'paymentToken' },
      { functionName: 'UNDERLYING_TOKEN' },
      { functionName: 'isPaused' },
    ]);

    return {
      discount: toBigInt(discountResult ?? 0),
      twapSeconds: Number(twapSecondsResult ?? 0),
      paymentToken: validateAndParseAddress(String(paymentTokenResult)),
      underlyingToken: validateAndParseAddress(String(underlyingTokenResult)),
      isPaused: Boolean(isPausedResult),
    };
  }

  /**
   * Reads the liquid-HYDX exercise quote for an oHYDX amount.
   *
   * Returns both the minimum payment quote and the payment token address so
   * partners can show how much USDC (or other payment token) the exercise
   * requires before building the write transaction.
   *
   * @param amount oHYDX amount to quote
   * @param readContracts injected batch read function bound to the options token
   */
  public static async getExerciseQuote(
    amount: BigintIsh,
    readContracts: ReadContractsFunction,
  ): Promise<ExerciseQuote> {
    const normalizedAmount = toBigInt(amount);
    const [paymentTokenResult, minPaymentAmountResult, minPriceResult] =
      await readContracts([
        { functionName: 'paymentToken' },
        { functionName: 'getMinPaymentAmount' },
        { functionName: 'getMinPrice', args: [normalizedAmount] },
      ]);

    return {
      amount: normalizedAmount,
      paymentAmount: toBigInt(minPriceResult ?? 0),
      twapAmount: toBigInt(minPaymentAmountResult ?? 0),
      paymentToken: validateAndParseAddress(String(paymentTokenResult)),
    };
  }

  /**
   * Reads the next veNFT id (`totalNftsMinted + 1`) for callers that plan to
   * use `exerciseToProtocolAccountAndMergeCallParameters`.
   *
   * @param readContract injected read function bound to the veToken contract
   */
  public static async getNextVeTokenId(
    readContract: ReadContractFunction,
  ): Promise<bigint> {
    const totalMinted = await readContract({
      functionName: 'totalNftsMinted',
    });

    return toBigInt(totalMinted ?? 0) + BigInt(1);
  }

  /**
   * Builds calldata for the liquid-HYDX exercise path.
   *
   * This wraps the options-token `exercise(...)` function, which converts
   * oHYDX into liquid HYDX and requires a payment token such as USDC.
   *
   * @param options oHYDX amount, max payment amount, recipient, and deadline
   */
  public static exerciseToLiquidHydxCallParameters(
    options: ExerciseToLiquidHydxOptions,
  ): MethodParameters {
    const deadlineSeconds = options.deadlineSeconds ?? 10 * 60;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    return {
      calldata: OptionsToken.OPTIONS_TOKEN_INTERFACE.encodeFunctionData(
        'exercise',
        [
          toBigInt(options.amount),
          toBigInt(options.maxPaymentAmount),
          validateAndParseAddress(options.recipient),
          deadline,
        ],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata for the protocol-account exercise path.
   *
   * This wraps the options-token `exerciseVe(...)` function, which converts
   * oHYDX into a new locked protocol account.
   *
   * @param options oHYDX amount and recipient for the newly created veNFT
   */
  public static exerciseToProtocolAccountCallParameters(
    options: ExerciseToProtocolAccountOptions,
  ): MethodParameters {
    return {
      calldata: OptionsToken.OPTIONS_TOKEN_INTERFACE.encodeFunctionData(
        'exerciseVe',
        [
          toBigInt(options.amount),
          validateAndParseAddress(options.recipient),
        ],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds the two-call flow to create a new protocol account from oHYDX, then
   * merge that new veNFT into an existing protocol account.
   *
   * The caller must supply `nextVeTokenId`, which is the veNFT id that will be
   * minted by the first `exerciseVe(...)` call. Use `getNextVeTokenId(...)`
   * immediately before building this bundle when possible.
   *
   * @param options oHYDX amount, recipient, new veNFT id, and merge target id
   */
  public static exerciseToProtocolAccountAndMergeCallParameters(
    options: ExerciseToProtocolAccountAndMergeOptions,
  ): MethodParameters {
    const exerciseCall = OptionsToken.exerciseToProtocolAccountCallParameters({
      amount: options.amount,
      recipient: options.recipient,
    });

    const mergeCalldata = OptionsToken.VE_TOKEN_INTERFACE.encodeFunctionData(
      'merge',
      [toBigInt(options.nextVeTokenId), toBigInt(options.targetTokenId)],
    );

    return {
      calldata: [exerciseCall.calldata as string, mergeCalldata],
      value: toHex(0),
    };
  }
}

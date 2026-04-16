import { Interface } from '@ethersproject/abi';
import { ichiVaultDepositGuardABI } from '../abis/ichiVaultDepositGuard';
import { BigintIsh } from '../types/BigIntish';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface IchiDepositOptions {
  /** The vault contract address. */
  vault: string;
  /**
   * The vault deployer address. Use ICHI_VAULT_DEPLOYER_ADDRESSES[chainId]
   * from the SDK constants.
   */
  vaultDeployer: string;
  /** The ERC20 token address to deposit (the vault's single accepted deposit token). */
  token: string;
  /** Token amount to deposit in wei. */
  amount: BigintIsh;
  /**
   * Minimum vault LP shares to receive (slippage guard). Derive from
   * IchiVault.estimateDepositShares (fallback) or IchiVault.applySlippage
   * on a simulated result.
   */
  minimumProceeds: BigintIsh;
  /** Address that receives the vault LP share tokens. */
  recipient: string;
}

export interface IchiNativeDepositOptions {
  /** The vault contract address. */
  vault: string;
  /**
   * The vault deployer address. Use ICHI_VAULT_DEPLOYER_ADDRESSES[chainId]
   * from the SDK constants.
   */
  vaultDeployer: string;
  /** Native ETH amount in wei. Sent as tx.value — use the returned `value` field. */
  amount: BigintIsh;
  /**
   * Minimum vault LP shares to receive (slippage guard). Derive from
   * IchiVault.estimateDepositShares (fallback) or IchiVault.applySlippage
   * on a simulated result.
   */
  minimumProceeds: BigintIsh;
  /** Address that receives the vault LP share tokens. */
  recipient: string;
}

export interface IchiWithdrawOptions {
  /** The vault contract address (also the ERC20 LP share token address). */
  vault: string;
  /**
   * The vault deployer address. Use ICHI_VAULT_DEPLOYER_ADDRESSES[chainId]
   * from the SDK constants.
   */
  vaultDeployer: string;
  /** Vault LP share tokens to burn in wei. */
  shares: BigintIsh;
  /** Address that receives the withdrawn tokens. */
  recipient: string;
  /**
   * Minimum token0 to receive (slippage guard). Derive from
   * IchiVault.estimateWithdrawAmounts (fallback) or IchiVault.applySlippage
   * on a simulated result.
   */
  minAmount0: BigintIsh;
  /**
   * Minimum token1 to receive (slippage guard). Derive from
   * IchiVault.estimateWithdrawAmounts (fallback) or IchiVault.applySlippage
   * on a simulated result.
   */
  minAmount1: BigintIsh;
}

/**
 * Helpers for building encoded calldata targeting the Ichi Vault Deposit Guard.
 *
 * All Ichi vault user transactions target the Deposit Guard, not the vault contract
 * directly. Use ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES[chainId] to resolve the `to`
 * address when sending the transaction.
 *
 * Approval requirements before sending:
 * - ERC20 deposit: approve the Deposit Guard for `amount` of the deposit token
 * - ERC20/native withdraw: approve the Deposit Guard for `shares` of the vault
 *   share token (the vault address is its own ERC20 share token)
 * - Native ETH deposit: no approval needed; send `amount` as tx.value
 */
export abstract class IchiVaultDepositGuard {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static INTERFACE: Interface = new Interface(
    ichiVaultDepositGuardABI as unknown as any[],
  );

  private constructor() {}

  /**
   * Produces the encoded calldata needed to deposit an ERC20 token into an Ichi vault
   * through the Deposit Guard.
   *
   * Before sending, approve the Deposit Guard to spend `options.amount` of
   * `options.token` on behalf of the caller.
   *
   * @param options ERC20 deposit parameters
   */
  public static buildDepositCallParameters(
    options: IchiDepositOptions,
  ): MethodParameters {
    return {
      calldata: IchiVaultDepositGuard.INTERFACE.encodeFunctionData(
        'forwardDepositToICHIVault',
        [
          validateAndParseAddress(options.vault),
          validateAndParseAddress(options.vaultDeployer),
          validateAndParseAddress(options.token),
          toBigInt(options.amount),
          toBigInt(options.minimumProceeds),
          validateAndParseAddress(options.recipient),
        ],
      ),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to deposit native ETH into an Ichi vault
   * through the Deposit Guard. The ETH amount must be included as tx.value — use
   * the `value` field from the returned MethodParameters.
   *
   * No token approval is required for native ETH deposits.
   *
   * @param options native ETH deposit parameters
   */
  public static buildNativeDepositCallParameters(
    options: IchiNativeDepositOptions,
  ): MethodParameters {
    return {
      calldata: IchiVaultDepositGuard.INTERFACE.encodeFunctionData(
        'forwardNativeDepositToICHIVault',
        [
          validateAndParseAddress(options.vault),
          validateAndParseAddress(options.vaultDeployer),
          toBigInt(options.minimumProceeds),
          validateAndParseAddress(options.recipient),
        ],
      ),
      value: toHex(toBigInt(options.amount).toString()),
    };
  }

  /**
   * Produces the encoded calldata needed to withdraw ERC20 tokens from an Ichi vault
   * through the Deposit Guard.
   *
   * Before sending, approve the Deposit Guard to spend `options.shares` of the vault
   * share token (the vault contract address is the ERC20 share token).
   *
   * @param options withdrawal parameters
   */
  public static buildWithdrawCallParameters(
    options: IchiWithdrawOptions,
  ): MethodParameters {
    return {
      calldata: IchiVaultDepositGuard.INTERFACE.encodeFunctionData(
        'forwardWithdrawFromICHIVault',
        [
          validateAndParseAddress(options.vault),
          validateAndParseAddress(options.vaultDeployer),
          toBigInt(options.shares),
          validateAndParseAddress(options.recipient),
          toBigInt(options.minAmount0),
          toBigInt(options.minAmount1),
        ],
      ),
      value: toHex(0),
    };
  }

  /**
   * Produces the encoded calldata needed to withdraw from an Ichi vault where one
   * token is WETH. The Deposit Guard automatically unwraps WETH to native ETH
   * before sending to the recipient.
   *
   * Before sending, approve the Deposit Guard to spend `options.shares` of the vault
   * share token.
   *
   * @param options withdrawal parameters
   */
  public static buildNativeWithdrawCallParameters(
    options: IchiWithdrawOptions,
  ): MethodParameters {
    return {
      calldata: IchiVaultDepositGuard.INTERFACE.encodeFunctionData(
        'forwardNativeWithdrawFromICHIVault',
        [
          validateAndParseAddress(options.vault),
          validateAndParseAddress(options.vaultDeployer),
          toBigInt(options.shares),
          validateAndParseAddress(options.recipient),
          toBigInt(options.minAmount0),
          toBigInt(options.minAmount1),
        ],
      ),
      value: toHex(0),
    };
  }
}

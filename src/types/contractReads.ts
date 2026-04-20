/** Parameters for a single contract read call. */
export interface ReadContractConfig {
  functionName: string;
  args?: readonly unknown[];
}

/**
 * A function that performs a single contract read.
 * The function must be pre-bound to the target contract address and chain.
 * Compatible with wagmi's `readContract` and viem's `readContract`.
 */
export type ReadContractFunction = <TResult = unknown>(
  config: ReadContractConfig,
) => Promise<TResult>;

/**
 * A function that performs multiple contract reads in a single batched call.
 * The function must be pre-bound to the target contract address and chain.
 * Compatible with wagmi's `readContracts` and viem's `multicall`.
 */
export type ReadContractsFunction = (
  configs: ReadContractConfig[],
) => Promise<unknown[]>;

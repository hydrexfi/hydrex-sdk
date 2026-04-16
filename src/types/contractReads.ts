export interface ReadContractConfig {
  functionName: string;
  args?: readonly unknown[];
}

export type ReadContractFunction = <TResult = unknown>(
  config: ReadContractConfig,
) => Promise<TResult>;

export type ReadContractsFunction = (
  configs: ReadContractConfig[],
) => Promise<unknown[]>;

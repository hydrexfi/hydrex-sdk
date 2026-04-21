import { Interface } from '@ethersproject/abi';
import { conduitABI } from '../abis/conduit';
import { merklDistributorABI } from '../abis/merklDistributor';
import { optionsTokenABI } from '../abis/optionsToken';
import { veTokenABI } from '../abis/veToken';
import { BigintIsh } from '../types/BigIntish';
import { ReadContractFunction, ReadContractsFunction } from '../types/contractReads';
import { MethodParameters, toHex } from '../utils/calldata';
import { toBigInt } from '../utils/toBigInt';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

/**
 * Max uint256 as a hex string, used for unlimited ERC-20 approval when
 * enabling liquid account automation via the options token.
 */
const MAX_UINT256 =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

// ---------------------------------------------------------------------------
// veNFT / protocol-account automation types
// ---------------------------------------------------------------------------

export interface AutomationApprovalState {
  hasClaimApproval: boolean;
  hasNftApproval: boolean;
  isFullyAutomated: boolean;
}

export interface SetConduitApprovalOptions {
  /**
   * What should this permission apply to?
   *
   * Use `tokenId: 0` to apply the conduit approval at the account level.
   *
   * Use a non-zero token id like `123` to apply the conduit approval only to
   * that specific veNFT.
   */
  tokenId: BigintIsh;
  conduitAddress: string;
  approve?: boolean;
}

export interface SetApprovalForAllOptions {
  operator: string;
  approved: boolean;
}

export interface SetMyPayoutRecipientOptions {
  recipient: string;
}

export interface AutomationHistoryOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
}

export interface VeNFTAutomationDistribution {
  token: string;
  amountRaw: string;
  amount: number;
  symbol: string;
  usd: number;
}

export interface VeNFTAutomationHistoryEntry {
  tokenId: bigint;
  owner: string;
  transactionHash: string;
  timestamp: string;
  previousEpochTimestamp: string;
  recipient: string;
  distributed: VeNFTAutomationDistribution[];
  totalUsd: number;
}

export interface VeNFTAutomationHistoryByToken {
  owner: string;
  historyByTokenId: Record<string, VeNFTAutomationHistoryEntry[]>;
}

// ---------------------------------------------------------------------------
// Liquid / gauge automation types
// ---------------------------------------------------------------------------

/**
 * Full approval state for liquid (gauge) account automation. All four axes
 * must be true for `isFullyAutomated` to be set.
 *
 * Corresponds to the frontend's `useIsGaugesAutomated` check, which verifies:
 *   1. `veToken.isClaimRedirectApprovedForAll` (hasClaimApproval)
 *   2. `veToken.isApprovedForAll`              (hasNftApproval)
 *   3. `merklDistributor.operators`            (hasMerklOperatorApproval)
 *   4. `optionsToken.allowance > 0`            (hasOptionsTokenApproval)
 */
export interface LiquidAutomationApprovalState {
  hasClaimApproval: boolean;
  hasNftApproval: boolean;
  hasMerklOperatorApproval: boolean;
  hasOptionsTokenApproval: boolean;
  isFullyAutomated: boolean;
}

export interface SetMerklOperatorOptions {
  /**
   * The wallet address that owns the liquid account — the user whose Merkl
   * operator list is being toggled.
   */
  userAddress: string;
  /** Address of the LpConduit to toggle as an operator. */
  conduitAddress: string;
}

export interface ApproveOptionsTokenOptions {
  /** Address of the LpConduit that will spend the options token. */
  conduitAddress: string;
  /**
   * Amount to approve. Omit (or pass undefined) when enabling automation to
   * use the MAX_UINT256 default. Pass `0` when revoking to clear the allowance.
   */
  amount?: BigintIsh;
}

/**
 * Return type for `automateGaugesCallParameters`. Each property is
 * ready-to-send calldata targeting a different contract:
 *
 * - `veTokenCalls[0]` → veToken           `setApprovalForAll`
 * - `veTokenCalls[1]` → veToken           `setConduitApproval`
 * - `merklDistributorCall` → merklDistributor  `toggleOperator`
 * - `optionsTokenCall`     → optionsToken      `approve`
 */
export interface GaugeAutomationCallParameters {
  veTokenCalls: MethodParameters[];
  merklDistributorCall: MethodParameters;
  optionsTokenCall: MethodParameters;
}

// ---------------------------------------------------------------------------
// AccountAutomation class
// ---------------------------------------------------------------------------

/**
 * Helpers for managing veNFT account automation through conduit contracts.
 *
 * In this SDK, "automation" means approving an on-chain conduit contract to
 * handle specific actions for a veNFT account flow. This does not give the
 * conduit control over the user's wallet. Callers provide the conduit address,
 * and these helpers build or read the on-chain approval state.
 *
 * ## Two automation flows
 *
 * ### Protocol-account (veNFT) automation
 * Per-token, conduit-selectable. Core calls are `setConduitApprovalCallParameters`
 * and (for veMaxi conduits only) `setApprovalForAllCallParameters`. Read state
 * with `getAutomationApprovalState`.
 *
 * ### Liquid (gauge) automation
 * Global toggle for the single LpConduit. Bundles four contract calls across
 * veToken, merklDistributor, and optionsToken. Use `automateGaugesCallParameters`
 * to build the full bundle, or call each helper individually. Read state with
 * `getLiquidAutomationApprovalState`.
 */
export abstract class AccountAutomation {
  public static VE_TOKEN_INTERFACE: Interface = new Interface(
    veTokenABI as unknown as any[],
  );
  public static CONDUIT_INTERFACE: Interface = new Interface(
    conduitABI as unknown as any[],
  );
  public static MERKL_DISTRIBUTOR_INTERFACE: Interface = new Interface(
    merklDistributorABI as unknown as any[],
  );
  public static OPTIONS_TOKEN_INTERFACE: Interface = new Interface(
    optionsTokenABI as unknown as any[],
  );

  private constructor() {}

  private static resolveFetch(options: AutomationHistoryOptions): typeof fetch {
    if (options.fetcher) {
      return options.fetcher;
    }

    if (typeof fetch === 'function') {
      return fetch;
    }

    throw new Error(
      'Automation history requires a fetch implementation. Pass AutomationHistoryOptions.fetcher when fetch is unavailable in this runtime.',
    );
  }

  private static buildAutomationHistoryUrl(
    owner: string,
    options: AutomationHistoryOptions,
  ): string {
    const trimmedBaseUrl = options.baseUrl.trim();

    if (!trimmedBaseUrl) {
      throw new Error('Automation history requires a non-empty baseUrl.');
    }

    return `${trimmedBaseUrl.replace(/\/+$/, '')}/conduits/user-jobs/${owner}`;
  }

  private static normalizeAutomationHistoryDistribution(
    rawDistribution: unknown,
  ): VeNFTAutomationDistribution {
    const distribution = rawDistribution as {
      token: unknown;
      amountRaw: unknown;
      amount: unknown;
      symbol?: unknown;
      usd: unknown;
    };

    return {
      token: validateAndParseAddress(String(distribution.token)),
      amountRaw: String(distribution.amountRaw),
      amount: Number(distribution.amount),
      symbol: String(distribution.symbol ?? ''),
      usd: Number(distribution.usd),
    };
  }

  private static normalizeAutomationHistoryEntry(
    rawEntry: unknown,
  ): VeNFTAutomationHistoryEntry {
    const entry = rawEntry as {
      tokenId: unknown;
      owner: unknown;
      transactionHash: unknown;
      timestamp: unknown;
      previousEpochTimestamp: unknown;
      recipient: unknown;
      distributed: unknown;
      totalUsd: unknown;
    };

    return {
      tokenId: toBigInt(entry.tokenId),
      owner: validateAndParseAddress(String(entry.owner)),
      transactionHash: String(entry.transactionHash),
      timestamp: String(entry.timestamp),
      previousEpochTimestamp: String(entry.previousEpochTimestamp),
      recipient: validateAndParseAddress(String(entry.recipient)),
      distributed: Array.isArray(entry.distributed)
        ? entry.distributed.map(AccountAutomation.normalizeAutomationHistoryDistribution)
        : [],
      totalUsd: Number(entry.totalUsd),
    };
  }

  private static normalizeAutomationHistoryResponse(
    owner: string,
    payload: unknown,
  ): VeNFTAutomationHistoryByToken {
    const historyByTokenId: Record<string, VeNFTAutomationHistoryEntry[]> = {};
    const rawGroups =
      payload !== null && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {};

    Object.entries(rawGroups).forEach(([tokenId, rawEntries]) => {
      historyByTokenId[tokenId] = Array.isArray(rawEntries)
        ? rawEntries.map(AccountAutomation.normalizeAutomationHistoryEntry)
        : [];
    });

    return {
      owner: validateAndParseAddress(owner),
      historyByTokenId,
    };
  }

  // -------------------------------------------------------------------------
  // Protocol-account (veNFT) automation — calldata builders
  // -------------------------------------------------------------------------

  /**
   * Builds calldata to approve or revoke a conduit for a specific veNFT.
   *
   * Use this when a partner already knows which conduit contract address should
   * automate the veNFT account. The returned calldata must be sent to the
   * veToken contract.
   *
   * @param options veNFT token id, conduit address, and approve or revoke toggle
   */
  public static setConduitApprovalCallParameters(
    options: SetConduitApprovalOptions,
  ): MethodParameters {
    const conduitAddress = validateAndParseAddress(options.conduitAddress);
    const approve = options.approve ?? true;

    return {
      calldata: AccountAutomation.VE_TOKEN_INTERFACE.encodeFunctionData(
        'setConduitApproval',
        [conduitAddress, toHex(options.tokenId), approve],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to grant or revoke ERC721 operator approval for all veNFTs.
   *
   * Call this alongside setConduitApprovalCallParameters only for veMaxi
   * conduits. Those conduits re-lock rewards as a new veNFT, so they need both
   * conduit approval and ERC721 operator approval.
   *
   * All other conduit strategies only need setConduitApprovalCallParameters.
   * The returned calldata must be sent to the veToken contract.
   *
   * @param options operator address and approval toggle
   */
  public static setApprovalForAllCallParameters(
    options: SetApprovalForAllOptions,
  ): MethodParameters {
    const operator = validateAndParseAddress(options.operator);

    return {
      calldata: AccountAutomation.VE_TOKEN_INTERFACE.encodeFunctionData(
        'setApprovalForAll',
        [operator, options.approved],
      ),
      value: toHex(0),
    };
  }

  // -------------------------------------------------------------------------
  // Protocol-account (veNFT) automation — reads
  // -------------------------------------------------------------------------

  /**
   * Reads the current automation approval state for an owner and conduit.
   *
   * This checks both claim approval and ERC721 operator approval on
   * veToken, then returns a small combined status object partners can show
   * directly in their automation UI.
   *
   * @param owner wallet address that owns the veNFT account
   * @param conduitAddress conduit contract address to inspect
   * @param readContracts injected batch read function bound to veToken
   */
  public static async getAutomationApprovalState(
    owner: string,
    conduitAddress: string,
    readContracts: ReadContractsFunction,
  ): Promise<AutomationApprovalState> {
    const normalizedOwner = validateAndParseAddress(owner);
    const normalizedConduitAddress = validateAndParseAddress(conduitAddress);

    const [claimRedirectApproval, nftApproval] = await readContracts([
      {
        functionName: 'isClaimRedirectApprovedForAll',
        args: [normalizedOwner, normalizedConduitAddress],
      },
      {
        functionName: 'isApprovedForAll',
        args: [normalizedOwner, normalizedConduitAddress],
      },
    ]);

    const hasClaimApproval = Boolean(claimRedirectApproval);
    const hasNftApproval = Boolean(nftApproval);

    return {
      hasClaimApproval,
      hasNftApproval,
      isFullyAutomated: hasClaimApproval && hasNftApproval,
    };
  }

  // -------------------------------------------------------------------------
  // Payout recipient
  // -------------------------------------------------------------------------

  /**
   * Builds calldata to update where a conduit sends automated payouts.
   *
   * The returned calldata must be sent to the selected conduit contract
   * address, not to veToken. Passing ADDRESS_ZERO resets payout routing to the
   * conduit's default self or caller behavior.
   *
   * @param options payout recipient address or ADDRESS_ZERO to reset
   */
  public static setMyPayoutRecipientCallParameters(
    options: SetMyPayoutRecipientOptions,
  ): MethodParameters {
    const recipient = validateAndParseAddress(options.recipient);

    return {
      calldata: AccountAutomation.CONDUIT_INTERFACE.encodeFunctionData(
        'setMyPayoutRecipient',
        [recipient],
      ),
      value: toHex(0),
    };
  }

  /**
   * Reads the current payout recipient for a user from a conduit contract.
   *
   * Use this when partners want to show where automated payouts are currently
   * routed before offering an update flow.
   *
   * @param userAddress wallet address to inspect
   * @param readContract injected read function bound to the conduit contract
   */
  public static async getPayoutRecipient(
    userAddress: string,
    readContract: ReadContractFunction,
  ): Promise<string> {
    const normalizedUserAddress = validateAndParseAddress(userAddress);

    return validateAndParseAddress(
      String(
        await readContract({
          functionName: 'userToPayoutRecipient',
          args: [normalizedUserAddress],
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Protocol-account (veNFT) automation — history
  // -------------------------------------------------------------------------

  /**
   * Reads API-backed veNFT automation history for a wallet owner.
   *
   * This is not a contract read. The data comes from the protocol API's
   * `/conduits/user-jobs/:owner` endpoint, which indexes completed automation
   * jobs and groups them by token id.
   *
   * @param owner wallet address that owns the veNFT accounts
   * @param options baseUrl and optional fetch implementation
   */
  public static async getAutomationHistoryByOwner(
    owner: string,
    options: AutomationHistoryOptions,
  ): Promise<VeNFTAutomationHistoryByToken> {
    const normalizedOwner = validateAndParseAddress(owner);
    const fetcher = AccountAutomation.resolveFetch(options);
    const endpoint = AccountAutomation.buildAutomationHistoryUrl(
      normalizedOwner,
      options,
    );

    let response: Response;
    try {
      response = await fetcher(endpoint, { method: 'GET' });
    } catch (error) {
      throw new Error(
        `Failed to fetch automation history from ${endpoint}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Failed to fetch automation history from ${endpoint}: ${response.status} ${response.statusText}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        `Failed to parse automation history response from ${endpoint}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return AccountAutomation.normalizeAutomationHistoryResponse(
      normalizedOwner,
      payload,
    );
  }

  /**
   * Reads API-backed veNFT automation history for a single token id.
   *
   * This reuses the owner-level history endpoint, then filters to the
   * requested token id while preserving the grouped-by-token response shape.
   *
   * @param owner wallet address that owns the veNFT account
   * @param tokenId veNFT token id to filter for
   * @param options baseUrl and optional fetch implementation
   */
  public static async getAutomationHistoryByTokenId(
    owner: string,
    tokenId: BigintIsh,
    options: AutomationHistoryOptions,
  ): Promise<VeNFTAutomationHistoryByToken> {
    const history = await AccountAutomation.getAutomationHistoryByOwner(
      owner,
      options,
    );
    const normalizedTokenId = toBigInt(tokenId).toString();

    return {
      owner: history.owner,
      historyByTokenId: {
        [normalizedTokenId]: history.historyByTokenId[normalizedTokenId] ?? [],
      },
    };
  }

  // -------------------------------------------------------------------------
  // Liquid (gauge) automation — calldata builders
  // -------------------------------------------------------------------------

  /**
   * Builds calldata to toggle the LpConduit as a Merkl operator for a user.
   *
   * `merklDistributor.toggleOperator` flips the current state rather than
   * accepting an explicit boolean. Only call this when the current Merkl
   * operator state is the opposite of what you want — check first with
   * `getLiquidAutomationApprovalState`. The returned calldata must be sent to
   * the merklDistributor contract.
   *
   * @param options user wallet address and LpConduit address
   */
  public static setMerklOperatorCallParameters(
    options: SetMerklOperatorOptions,
  ): MethodParameters {
    const userAddress = validateAndParseAddress(options.userAddress);
    const conduitAddress = validateAndParseAddress(options.conduitAddress);

    return {
      calldata: AccountAutomation.MERKL_DISTRIBUTOR_INTERFACE.encodeFunctionData(
        'toggleOperator',
        [userAddress, conduitAddress],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds calldata to set the options token allowance for the LpConduit.
   *
   * Omit `amount` (or pass undefined) when enabling — defaults to MAX_UINT256.
   * Pass `amount: 0` when revoking to clear the allowance. The returned
   * calldata must be sent to the optionsToken contract.
   *
   * @param options LpConduit address and optional spend amount
   */
  public static approveOptionsTokenCallParameters(
    options: ApproveOptionsTokenOptions,
  ): MethodParameters {
    const conduitAddress = validateAndParseAddress(options.conduitAddress);
    const amount = options.amount !== undefined ? toHex(options.amount) : MAX_UINT256;

    return {
      calldata: AccountAutomation.OPTIONS_TOKEN_INTERFACE.encodeFunctionData(
        'approve',
        [conduitAddress, amount],
      ),
      value: toHex(0),
    };
  }

  /**
   * Builds the full four-call bundle required to enable or disable liquid
   * (gauge) account automation. Mirrors the frontend's `useAutomateGauges`.
   *
   * Because the four calls target three different contracts, the return value
   * is a typed struct — callers are responsible for routing each to the correct
   * address:
   *
   * ```
   * veTokenCalls[0]      → veToken            setApprovalForAll(lpConduit, approved)
   * veTokenCalls[1]      → veToken            setConduitApproval(lpConduit, 0, approved)
   * merklDistributorCall → merklDistributor   toggleOperator(userAddress, lpConduit)
   * optionsTokenCall     → optionsToken       approve(lpConduit, maxUint256 | 0)
   * ```
   *
   * **Important:** `toggleOperator` flips state rather than setting it
   * explicitly. Only submit this bundle when the Merkl operator state is the
   * opposite of `approved` — use `getLiquidAutomationApprovalState` to confirm
   * first.
   *
   * @param lpConduitAddress address of the LpConduit
   * @param userAddress wallet address of the account owner
   * @param approved true to enable automation, false to revoke
   */
  public static automateGaugesCallParameters(
    lpConduitAddress: string,
    userAddress: string,
    approved: boolean,
  ): GaugeAutomationCallParameters {
    const conduit = validateAndParseAddress(lpConduitAddress);
    const user = validateAndParseAddress(userAddress);

    const veTokenCalls: MethodParameters[] = [
      AccountAutomation.setApprovalForAllCallParameters({
        operator: conduit,
        approved,
      }),
      AccountAutomation.setConduitApprovalCallParameters({
        conduitAddress: conduit,
        tokenId: 0,
        approve: approved,
      }),
    ];

    const merklDistributorCall = AccountAutomation.setMerklOperatorCallParameters({
      userAddress: user,
      conduitAddress: conduit,
    });

    const optionsTokenCall = AccountAutomation.approveOptionsTokenCallParameters({
      conduitAddress: conduit,
      amount: approved ? undefined : 0,
    });

    return { veTokenCalls, merklDistributorCall, optionsTokenCall };
  }

  // -------------------------------------------------------------------------
  // Liquid (gauge) automation — reads
  // -------------------------------------------------------------------------

  /**
   * Reads all four approval axes required for liquid (gauge) account automation.
   *
   * Corresponds to the frontend's `useIsGaugesAutomated` hook, which checks:
   *   1. `veToken.isClaimRedirectApprovedForAll` (claim approval)
   *   2. `veToken.isApprovedForAll`              (ERC721 operator approval)
   *   3. `merklDistributor.operators`            (Merkl operator approval)
   *   4. `optionsToken.allowance > 0`            (options token spend approval)
   *
   * Each injected read function must be pre-bound to its respective contract.
   *
   * @param owner wallet address that owns the liquid account
   * @param lpConduitAddress address of the LpConduit
   * @param readVeTokenContracts batch read function bound to veToken
   * @param readMerklOperator read function bound to merklDistributor
   * @param readOptionsTokenAllowance read function bound to optionsToken
   */
  public static async getLiquidAutomationApprovalState(
    owner: string,
    lpConduitAddress: string,
    readVeTokenContracts: ReadContractsFunction,
    readMerklOperator: ReadContractFunction,
    readOptionsTokenAllowance: ReadContractFunction,
  ): Promise<LiquidAutomationApprovalState> {
    const normalizedOwner = validateAndParseAddress(owner);
    const normalizedConduit = validateAndParseAddress(lpConduitAddress);

    const [[claimRedirectApproval, nftApproval], merklApproval, allowance] =
      await Promise.all([
        readVeTokenContracts([
          {
            functionName: 'isClaimRedirectApprovedForAll',
            args: [normalizedOwner, normalizedConduit],
          },
          {
            functionName: 'isApprovedForAll',
            args: [normalizedOwner, normalizedConduit],
          },
        ]),
        readMerklOperator({
          functionName: 'operators',
          args: [normalizedOwner, normalizedConduit],
        }),
        readOptionsTokenAllowance({
          functionName: 'allowance',
          args: [normalizedOwner, normalizedConduit],
        }),
      ]);

    const hasClaimApproval = Boolean(claimRedirectApproval);
    const hasNftApproval = Boolean(nftApproval);
    const hasMerklOperatorApproval = Boolean(merklApproval);
    const hasOptionsTokenApproval = BigInt(String(allowance)) > BigInt(0);

    return {
      hasClaimApproval,
      hasNftApproval,
      hasMerklOperatorApproval,
      hasOptionsTokenApproval,
      isFullyAutomated:
        hasClaimApproval &&
        hasNftApproval &&
        hasMerklOperatorApproval &&
        hasOptionsTokenApproval,
    };
  }
}

import { Interface } from '@ethersproject/abi';
import { conduitABI } from '../abis/conduit';
import { veTokenABI } from '../abis/veToken';
import { BigintIsh } from '../types/BigIntish';
import { ReadContractFunction, ReadContractsFunction } from '../types/contractReads';
import { MethodParameters, toHex } from '../utils/calldata';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';

export interface AutomationApprovalState {
  hasClaimApproval: boolean;
  hasNftApproval: boolean;
  isFullyAutomated: boolean;
}

export interface SetConduitApprovalOptions {
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

/**
 * Helpers for managing veNFT account automation through conduit contracts.
 *
 * In this SDK, "automation" means approving an on-chain conduit contract to
 * handle specific actions for a veNFT account flow. This does not give the
 * conduit control over the user's wallet. Callers provide the conduit address,
 * and these helpers build or read the on-chain approval state.
 */
export abstract class AccountAutomation {
  public static VE_TOKEN_INTERFACE: Interface = new Interface(
    veTokenABI as unknown as any[],
  );
  public static CONDUIT_INTERFACE: Interface = new Interface(
    conduitABI as unknown as any[],
  );

  private constructor() {}

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
   * Some automation strategies need operator approval in addition to conduit
   * approval, which is why this helper is exposed separately. The returned
   * calldata must be sent to the veToken contract.
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
}

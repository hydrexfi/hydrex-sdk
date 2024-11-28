import { ChainId } from "../constants/chainIds";
import { Token } from './Token';

/**
 * Known WETH9 implementation addresses, used in our implementation of Ether#wrapped
 */
export const WNATIVE: { [chainId: number]: Token } = {
  [ChainId.KakarotSepolia]: new Token(
    ChainId.KakarotSepolia,
    '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
    18,
    'WETH',
    'Wrapped ETH'
  ),
};

import { ChainId } from './chainIds';

export const POOL_DEPLOYER_ADDRESSES: { [chainId: number]: string } = {
  [ChainId.BaseSepolia]: '0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7',
  [ChainId.Base]: '0x1595A5D101d69D2a2bAB2976839cC8eeEb13Ab94',
};

export const POOL_INIT_CODE_HASH: { [chainId: number]: string } = {
  [ChainId.BaseSepolia]: '0xa18736c3ee97fe3c96c9428c0cc2a9116facec18e84f95f9da30543f8238a782',
  [ChainId.Base]: '0xa18736c3ee97fe3c96c9428c0cc2a9116facec18e84f95f9da30543f8238a782',
};

export const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: { [chainId: number]: string } = {
  [ChainId.BaseSepolia]: '0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8',
  [ChainId.Base]: '0xC63E9672f8e93234C73cE954a1d1292e4103Ab86',
};

export const SWAP_ROUTER_ADDRESSES: { [chainId: number]: string } = {
  [ChainId.BaseSepolia]: '0x10Dcb20d06fbC1461D21D6b31E54042D656C67FC',
  [ChainId.Base]: '0x6f4bE24d7dC93b6ffcBAb3Fd0747c5817Cea3F9e',
};

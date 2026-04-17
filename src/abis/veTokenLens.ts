export const veTokenLensABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'address', name: '_pair', type: 'address' },
    ],
    name: 'singlePairReward',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'id', type: 'uint256' },
          { internalType: 'uint256', name: 'amount', type: 'uint256' },
          { internalType: 'uint8', name: 'decimals', type: 'uint8' },
          { internalType: 'address', name: 'pair', type: 'address' },
          { internalType: 'address', name: 'token', type: 'address' },
          { internalType: 'address', name: 'fee', type: 'address' },
          { internalType: 'address', name: 'bribe', type: 'address' },
          { internalType: 'string', name: 'symbol', type: 'string' },
        ],
        internalType: 'struct veNFTAPIHydrex.Reward[]',
        name: '_reward',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

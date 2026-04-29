export const partnerEscrowABI = [
  {
    inputs: [
      { internalType: 'address[]', name: '_poolVote', type: 'address[]' },
      {
        internalType: 'uint256[]',
        name: '_voteProportions',
        type: 'uint256[]',
      },
    ],
    name: 'vote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'delegatee', type: 'address' }],
    name: 'delegate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'conduitAddress',
        type: 'address',
      },
      { internalType: 'bool', name: 'approve', type: 'bool' },
    ],
    name: 'setConduitApprovalForEscrowedToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address[]', name: 'feeAddresses', type: 'address[]' },
      {
        internalType: 'address[]',
        name: 'bribeAddresses',
        type: 'address[]',
      },
      { internalType: 'address[]', name: 'claimTokens', type: 'address[]' },
    ],
    name: 'claimRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimVeToken',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

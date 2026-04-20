export const conduitABI = [
  {
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    name: 'userToPayoutRecipient',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_recipient', type: 'address' }],
    name: 'setMyPayoutRecipient',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

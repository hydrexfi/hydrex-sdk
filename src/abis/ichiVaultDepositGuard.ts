export const ichiVaultDepositGuardABI = [
  {
    inputs: [
      { internalType: 'address', name: 'vault', type: 'address' },
      { internalType: 'address', name: 'vaultDeployer', type: 'address' },
      { internalType: 'address', name: 'token', type: 'address' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
      { internalType: 'uint256', name: 'minimumProceeds', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'forwardDepositToICHIVault',
    outputs: [
      { internalType: 'uint256', name: 'vaultTokens', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'vault', type: 'address' },
      { internalType: 'address', name: 'vaultDeployer', type: 'address' },
      { internalType: 'uint256', name: 'minimumProceeds', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
    ],
    name: 'forwardNativeDepositToICHIVault',
    outputs: [
      { internalType: 'uint256', name: 'vaultTokens', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'vault', type: 'address' },
      { internalType: 'address', name: 'vaultDeployer', type: 'address' },
      { internalType: 'uint256', name: 'shares', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'minAmount0', type: 'uint256' },
      { internalType: 'uint256', name: 'minAmount1', type: 'uint256' },
    ],
    name: 'forwardWithdrawFromICHIVault',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'vault', type: 'address' },
      { internalType: 'address', name: 'vaultDeployer', type: 'address' },
      { internalType: 'uint256', name: 'shares', type: 'uint256' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'minAmount0', type: 'uint256' },
      { internalType: 'uint256', name: 'minAmount1', type: 'uint256' },
    ],
    name: 'forwardNativeWithdrawFromICHIVault',
    outputs: [
      { internalType: 'uint256', name: 'amount0', type: 'uint256' },
      { internalType: 'uint256', name: 'amount1', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

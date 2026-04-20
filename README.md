# Hydrex SDK

A TypeScript SDK for interacting with the Hydrex concentrated-liquidity AMM on Base.

## Overview

The Hydrex SDK provides tools to:

- Compute pool addresses
- Model pools, positions, routes, and trades
- Build calldata for swaps via the swap router
- Build calldata for liquidity management via the position manager
- Work with ERC4626 "boosted" token vaults
- Stake and unstake LP tokens via gauges
- Vote on gauge weights via the Voter contract
- Claim gauge rewards, veNFT fees, and bribes
- Interact with Ichi single-sided vaults

## Installation

```bash
npm install @hydrexfi/hydrex-sdk
# or
yarn add @hydrexfi/hydrex-sdk
```

## Supported Networks


| Network      | Chain ID | Status  | Pool Deployer                                |
| ------------ | -------- | ------- | -------------------------------------------- |
| Base         | 8453     | Mainnet | `0x1595A5D101d69D2a2bAB2976839cC8eeEb13Ab94` |
| Base Sepolia | 84532    | Testnet | `0x9cb57c3E31D50fa5c273eC0a5A51cF9cb3B127A7` |


## Quick Start

```typescript
import {
  Token,
  Pool,
  Position,
  Route,
  Trade,
  TradeType,
  SwapRouter,
  NonfungiblePositionManager,
  ChainId,
  WNATIVE,
  Percent,
  CurrencyAmount,
} from '@hydrexfi/hydrex-sdk';
```

---

## Core Concepts

### Currencies and Tokens

#### `Token`

Represents an ERC-20 token.

```typescript
import { Token, ChainId } from '@hydrexfi/hydrex-sdk';

const USDC = new Token(
  ChainId.Base,
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  6,
  'USDC',
  'USD Coin'
);
```

#### `Native` / `ExtendedNative`

Represent the native chain currency (ETH on Base). Use `Native.onChain(chainId)` or `ExtendedNative.onChain(chainId)` to get a cached instance. Both wrap to `WNATIVE[chainId]`.

```typescript
import { Native, ChainId } from '@hydrexfi/hydrex-sdk';

const eth = Native.onChain(ChainId.Base);
```

#### `BoostedToken`

Represents an ERC4626 vault-share token (e.g. a Morpho or Euler position). The vault deposits the `underlying` token and issues shares.

```typescript
import { BoostedToken, ChainId } from '@hydrexfi/hydrex-sdk';

const mwETH = new BoostedToken(
  ChainId.Base,
  '0xYourVaultAddress',
  18,
  'mwETH',
  'Morpho Wrapped ETH',
  WETH // underlying Token
);
```

#### `CurrencyAmount<T>`

Wraps a raw token amount with its currency.

```typescript
import { CurrencyAmount } from '@hydrexfi/hydrex-sdk';

const amount = CurrencyAmount.fromRawAmount(USDC, '1000000'); // 1 USDC
```

#### `Percent`

A `Fraction` that renders as a percentage.

```typescript
import { Percent } from '@hydrexfi/hydrex-sdk';

const slippage = new Percent(50, 10_000); // 0.5%
```

#### `Price<Base, Quote>`

A typed price between two currencies.

```typescript
import { Price } from '@hydrexfi/hydrex-sdk';

const price = new Price({ baseAmount: usdcAmount, quoteAmount: wethAmount });
```

---

### Computing Pool Addresses

`Pool.getAddress` is the recommended surface — it automatically uses `POOL_DEPLOYER_ADDRESSES` for the token's chain:

```typescript
import { Pool } from '@hydrexfi/hydrex-sdk';

const poolAddress = Pool.getAddress(USDC, WETH);
```

For lower-level use cases (e.g. a custom deployer address), use `computePoolAddress` directly with an explicit `poolDeployer`:

```typescript
import { computePoolAddress, POOL_DEPLOYER_ADDRESSES, ChainId } from '@hydrexfi/hydrex-sdk';

// Standard pool
const poolAddress = computePoolAddress({
  poolDeployer: POOL_DEPLOYER_ADDRESSES[ChainId.Base],
  tokenA: USDC,
  tokenB: WETH,
});

// Custom deployer
const customPoolAddress = computePoolAddress({
  poolDeployer: '0xYourCustomDeployer',
  tokenA: USDC,
  tokenB: WETH,
});
```

---

### Creating a Pool Instance

The `Pool` constructor requires the pool deployer address and the tick spacing in addition to the standard Uniswap V3 parameters.

```typescript
import {
  Pool,
  POOL_DEPLOYER_ADDRESSES,
  INITIAL_POOL_FEE,
  DEFAULT_TICK_SPACING,
  ChainId,
} from '@hydrexfi/hydrex-sdk';

const pool = new Pool(
  USDC,                                       // tokenA
  WETH,                                       // tokenB
  INITIAL_POOL_FEE,                           // fee tier (100)
  sqrtRatioX96,                               // current sqrt price (Q64.96)
  POOL_DEPLOYER_ADDRESSES[ChainId.Base],      // deployer address
  liquidity,                                  // in-range liquidity
  tickCurrent,                                // current tick
  DEFAULT_TICK_SPACING,                       // tick spacing (60)
  ticks                                       // tick data provider or array
);

// Derived prices
const token0Price: Price = pool.token0Price;
const token1Price: Price = pool.token1Price;

// Pool address
const address: string = Pool.getAddress(USDC, WETH);

// Simulate a swap
const [outputAmount, updatedPool] = await pool.getOutputAmount(inputAmount);
```

---

### Swapping

Build calldata for an exact-input or exact-output swap:

```typescript
import {
  Trade,
  Route,
  SwapRouter,
  TradeType,
  Percent,
  CurrencyAmount,
  SWAP_ROUTER_ADDRESSES,
  ChainId,
} from '@hydrexfi/hydrex-sdk';

const route = new Route([pool], USDC, WETH);

const trade = Trade.createUncheckedTrade({
  route,
  inputAmount: CurrencyAmount.fromRawAmount(USDC, '1000000'), // 1 USDC
  outputAmount: CurrencyAmount.fromRawAmount(WETH, estimatedOutput),
  tradeType: TradeType.EXACT_INPUT,
});

const { calldata, value } = SwapRouter.swapCallParameters(trade, {
  slippageTolerance: new Percent(50, 10_000), // 0.5%
  recipient: '0xYourWallet',
  deadline: Math.floor(Date.now() / 1000) + 60 * 20,
});

// Send tx to SWAP_ROUTER_ADDRESSES[ChainId.Base]
```

#### `Trade` factories


| Factory                                                        | Description                                          |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `Trade.exactIn(route, amountIn)`                               | Async; simulates the output amount through tick math |
| `Trade.exactOut(route, amountOut)`                             | Async; simulates the input amount through tick math  |
| `Trade.fromRoute(route, amount, tradeType)`                    | Async single-route factory                           |
| `Trade.fromRoutes(routes, tradeType)`                          | Async multi-route factory                            |
| `Trade.createUncheckedTrade(options)`                          | Sync; skips simulation (use pre-computed amounts)    |
| `Trade.createUncheckedTradeWithMultipleRoutes(options)`        | Sync multi-route                                     |
| `Trade.bestTradeExactIn(pools, amountIn, tokenOut, options?)`  | Finds best route for exact-in                        |
| `Trade.bestTradeExactOut(pools, tokenIn, amountOut, options?)` | Finds best route for exact-out                       |


---

### Managing Liquidity

#### `Position`

```typescript
import { Position, nearestUsableTick, DEFAULT_TICK_SPACING } from '@hydrexfi/hydrex-sdk';

const position = Position.fromAmounts({
  pool,
  tickLower: nearestUsableTick(tickCurrent - DEFAULT_TICK_SPACING * 10, DEFAULT_TICK_SPACING),
  tickUpper: nearestUsableTick(tickCurrent + DEFAULT_TICK_SPACING * 10, DEFAULT_TICK_SPACING),
  amount0: '1000000',
  amount1: '500000000000000000',
  useFullPrecision: true,
});

// amount0/amount1 at current tick
const { amount0, amount1 } = position.mintAmounts;
```

#### Minting a new position

```typescript
import { NonfungiblePositionManager, Percent, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES, ChainId } from '@hydrexfi/hydrex-sdk';

const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, {
  slippageTolerance: new Percent(50, 10_000),
  recipient: '0xYourWallet',
  deadline: Math.floor(Date.now() / 1000) + 60 * 20,
});

// Send tx to NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[ChainId.Base]
```

#### Increasing liquidity on an existing position

```typescript
const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, {
  tokenId: '42',
  slippageTolerance: new Percent(50, 10_000),
  deadline: Math.floor(Date.now() / 1000) + 60 * 20,
});
```

#### Collecting fees

```typescript
const { calldata, value } = NonfungiblePositionManager.collectCallParameters({
  tokenId: '42',
  recipient: '0xYourWallet',
  expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, '0'),
  expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(WETH, '0'),
});
```

#### Removing liquidity

```typescript
const { calldata, value } = NonfungiblePositionManager.removeCallParameters(position, {
  tokenId: '42',
  liquidityPercentage: new Percent(100, 100), // 100% removal
  slippageTolerance: new Percent(50, 10_000),
  deadline: Math.floor(Date.now() / 1000) + 60 * 20,
  collectOptions: {
    expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(USDC, '0'),
    expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(WETH, '0'),
    recipient: '0xYourWallet',
  },
});
```

---

### Boosted Tokens (ERC4626 Vaults)

Hydrex supports ERC4626 vault-wrapped tokens as first-class routing entities. A `BoostedRoute` automatically inserts `WRAP`/`UNWRAP` steps around the core `SWAP` step.

```typescript
import { BoostedToken, BoostedRoute, BoostedRouteStepType } from '@hydrexfi/hydrex-sdk';

const mwETH = new BoostedToken(
  ChainId.Base,
  '0xYourVaultAddress',
  18,
  'mwETH',
  'Morpho Wrapped ETH',
  WETH
);

// Route: USDC → mwETH (SDK inserts WRAP of WETH → mwETH automatically)
const boostedRoute = new BoostedRoute([pool], USDC, mwETH);

// Inspect route steps
boostedRoute.steps.forEach(step => {
  if (step.type === BoostedRouteStepType.WRAP) { /* ... */ }
  if (step.type === BoostedRouteStepType.SWAP) { /* ... */ }
  if (step.type === BoostedRouteStepType.UNWRAP) { /* ... */ }
});
```

---

### Gauges (Staking)

`Gauge` provides calldata builders for staking LP tokens and helpers for reading staking state. All methods are static. The `to` address for the transaction is the gauge contract address.

#### Write: calldata builders

```typescript
import { Gauge } from '@hydrexfi/hydrex-sdk';

// Stake a specific amount
const { calldata } = Gauge.depositCallParameters('1000000000000000000');

// Stake the caller's full balance
const { calldata } = Gauge.depositAllCallParameters();

// Unstake a specific amount
const { calldata } = Gauge.withdrawCallParameters('1000000000000000000');

// Unstake everything (rewards not included — for Ichi/Gamma strategies)
const { calldata } = Gauge.withdrawAllCallParameters();

// Unstake everything and claim all pending rewards in one tx
const { calldata } = Gauge.withdrawAllAndHarvestCallParameters();

// Claim rewards for the caller
const { calldata } = Gauge.getRewardCallParameters();

// Claim rewards on behalf of a user
const { calldata } = Gauge.getRewardCallParameters('0xUserAddress');

// Claim specific reward tokens on behalf of a user
const { calldata } = Gauge.getRewardCallParameters('0xUserAddress', ['0xRewardToken']);
```

#### Read: injected contract reads

```typescript
// Staked balance (shares)
const staked: bigint = await Gauge.getUserStaked('0xUser', readContract);

// Pending reward
const pending: bigint = await Gauge.getPendingReward('0xUser', readContract);
// With explicit reward token
const pending: bigint = await Gauge.getPendingReward('0xUser', readContract, '0xRewardToken');

// Staked balance + pending reward in one batched call
const { staked, pendingReward }: GaugeUserState = await Gauge.getUserState('0xUser', '0xRewardToken', readContracts);

// Total staked supply
const supply: bigint = await Gauge.getTotalSupply(readContract);

// Token to approve before depositing
const stakeToken: string = await Gauge.getStakeToken(readContract);

// Primary reward token
const rewardToken: string = await Gauge.getRewardToken(readContract);

// Whether a given token is a recognized reward
const isReward: boolean = await Gauge.isRewardToken('0xToken', readContract);
```

---

### Voter (Governance)

`Voter` provides calldata builders for gauge weight voting and read helpers for inspecting voting state. All methods are static. The `to` address is `VOTER_ADDRESSES[chainId]`.

#### Write: calldata builders

```typescript
import { Voter } from '@hydrexfi/hydrex-sdk';

// Vote on pools — weights define relative proportions summing to 100%
const { calldata } = Voter.voteCallParameters({
  pools: ['0xPool1', '0xPool2'],
  weights: [6000, 4000], // 60% / 40%
});

// Recast saved votes at current voting power
const { calldata } = Voter.pokeCallParameters();

// Clear all votes
const { calldata } = Voter.resetCallParameters();
```

#### Read: injected contract reads

```typescript
// Current epoch details
const epoch: EpochDetails = await Voter.getEpochDetails(readContracts);

// User's vote allocation split by pool (as percentages)
const percents: UserVotePercents = await Voter.getUserVotePercents('0xUser', readContracts);
// percents.byPool => { '0xPool1': '60', '0xPool2': '40' }

// Whether a user has already voted this epoch
const voted: boolean = Voter.hasVotedForEpoch(epoch, percents.lastVotedTimestamp);

// Total voting weight across all pools
const stats: VoteStats = await Voter.getVoteStats(readContract);

// Per-pool weights for a set of pools
const weights: PoolWeights = await Voter.getPoolWeights(['0xPool1', '0xPool2'], readContracts);

// Individual pool queries
const length: bigint = await Voter.getPoolVoteLength('0xUser', readContract);
const pool: string  = await Voter.getPoolVote('0xUser', 0, readContract);
const votes: bigint = await Voter.getVotes('0xUser', '0xPool', readContract);
const lastVoted: bigint = await Voter.getLastVoted('0xUser', readContract);
const totalWeight: bigint = await Voter.getTotalWeight(readContract);
const weight: bigint = await Voter.getWeight('0xPool', readContract);
```

---

### Claiming Rewards

`ClaimRewards` builds calldata for claiming gauge rewards. All transactions target `VOTER_ADDRESSES[chainId]`.

#### Discovering claimable rewards

```typescript
import { ClaimRewards, GaugeRewardReadInput } from '@hydrexfi/hydrex-sdk';

const gauges: GaugeRewardReadInput[] = [
  { gaugeAddress: '0xGauge1', readContract: readContractForGauge1 },
  { gaugeAddress: '0xGauge2', readContract: readContractForGauge2, rewardTokenAddress: '0xReward' },
];

// Returns gauge addresses that have pending rewards > 0
const claimable: string[] = await ClaimRewards.getClaimableGaugeAddresses('0xUser', gauges);

// Returns { gaugeAddress, tokens[] } entries ready for token-specific claim builders
const claims: RewardTokenClaimItem[] = await ClaimRewards.getClaimableRewardTokenClaims('0xUser', gauges);
```

#### Write: calldata builders

```typescript
// Claim from one or more gauges (simple)
const { calldata } = ClaimRewards.claimRewardsCallParameters({
  gaugeAddresses: ['0xGauge1', '0xGauge2'],
});

// Claim on behalf of another address
const { calldata } = ClaimRewards.claimRewardsForCallParameters({
  gaugeAddresses: ['0xGauge1'],
  claimFor: '0xOtherUser',
});

// Claim specific reward tokens from one gauge
const { calldata } = ClaimRewards.claimRewardTokenCallParameters({
  claim: { gaugeAddress: '0xGauge1', tokens: ['0xRewardToken'] },
});

// Claim specific reward tokens from multiple gauges
const { calldata } = ClaimRewards.claimRewardTokensCallParameters({
  claims: [
    { gaugeAddress: '0xGauge1', tokens: ['0xRewardToken1'] },
    { gaugeAddress: '0xGauge2', tokens: ['0xRewardToken2'] },
  ],
});

// Claim specific tokens on behalf of a user
const { calldata } = ClaimRewards.claimRewardTokensForCallParameters({
  claimFor: '0xOtherUser',
  claims: [{ gaugeAddress: '0xGauge1', tokens: ['0xRewardToken'] }],
});

// Claim specific tokens on behalf of a user and route to a recipient
const { calldata } = ClaimRewards.claimRewardTokensToRecipientCallParameters({
  claimFor: '0xOtherUser',
  recipient: '0xRecipient',
  claims: [{ gaugeAddress: '0xGauge1', tokens: ['0xRewardToken'] }],
});
```

---

### veNFT Claims (Fees & Bribes)

`VeNFTClaims` builds calldata for veNFT holders to claim trading fees and voting bribes. All transactions target `VOTER_ADDRESSES[chainId]`.

```typescript
import { VeNFTClaims } from '@hydrexfi/hydrex-sdk';

// Claim fees from a single fee contract for token ID 42
const { calldata } = VeNFTClaims.claimFeeCallParameters({
  tokenId: 42n,
  claim: { feeAddress: '0xFeeContract', tokens: ['0xToken1'] },
});

// Claim fees from multiple fee contracts
const { calldata } = VeNFTClaims.claimFeesCallParameters({
  tokenId: 42n,
  claims: [
    { feeAddress: '0xFee1', tokens: ['0xToken1'] },
    { feeAddress: '0xFee2', tokens: ['0xToken2'] },
  ],
});

// Claim fees and route to a specific recipient
const { calldata } = VeNFTClaims.claimFeesToRecipientByTokenIdCallParameters({
  tokenId: 42n,
  recipient: '0xRecipient',
  claims: [{ feeAddress: '0xFee1', tokens: ['0xToken1'] }],
});

// Claim bribes from a single bribe contract
const { calldata } = VeNFTClaims.claimBribeCallParameters({
  tokenId: 42n,
  claim: { bribeAddress: '0xBribeContract', tokens: ['0xToken1'] },
});

// Claim bribes from multiple bribe contracts
const { calldata } = VeNFTClaims.claimBribesCallParameters({
  tokenId: 42n,
  claims: [{ bribeAddress: '0xBribe1', tokens: ['0xToken1'] }],
});

// Claim bribes and route to a specific recipient
const { calldata } = VeNFTClaims.claimBribesToRecipientByTokenIdCallParameters({
  tokenId: 42n,
  recipient: '0xRecipient',
  claims: [{ bribeAddress: '0xBribe1', tokens: ['0xToken1'] }],
});
```

#### Discovering fee and bribe claims with `VeNFTLens`

`VeNFTLens` reads the `VeTokenLens` contract to discover which fees and bribes are claimable for a given veNFT. The output is shaped to pass directly into the `VeNFTClaims` builders.

```typescript
import { VeNFTLens, VeNFTClaimable } from '@hydrexfi/hydrex-sdk';

// Discover claimable rewards for a single pair
const rewards: VeTokenLensReward[] = await VeNFTLens.getSinglePairReward(
  42n,             // veNFT token ID
  '0xPairAddress',
  readContract,    // bound to VE_TOKEN_LENS_ADDRESSES[chainId]
);

// Discover all claimable fees and bribes across multiple voted pairs
const claimable: VeNFTClaimable = await VeNFTLens.getAllClaimable(
  42n,
  ['0xPair1', '0xPair2'],
  readContracts,   // bound to VE_TOKEN_LENS_ADDRESSES[chainId]
);

// claimable.fees and claimable.bribes are ready for VeNFTClaims builders
const { calldata } = VeNFTClaims.claimFeesCallParameters({
  tokenId: 42n,
  claims: claimable.fees,
});
const { calldata: briberCalldata } = VeNFTClaims.claimBribesCallParameters({
  tokenId: 42n,
  claims: claimable.bribes,
});
```

---

### Account Automation

`AccountAutomation` manages on-chain approvals that let conduit contracts act on behalf of a user. Two distinct flows exist.

- **Protocol-account (veNFT) automation** — per-token, conduit-selectable. Approve a conduit for a specific token ID, or use `tokenId: 0` for an account-level approval that covers all veNFTs.
- **Liquid (gauge) automation** — a global toggle for the LpConduit across four contracts (veToken, merklDistributor, optionsToken).

#### Protocol-account (veNFT) automation

Check the current state before building any transactions:

```typescript
import { AccountAutomation } from '@hydrexfi/hydrex-sdk';

// readContracts must be bound to the veToken contract
const state = await AccountAutomation.getAutomationApprovalState(
  '0xOwnerWallet',
  '0xConduitAddress',
  readContracts,
);
// state.hasClaimApproval  — isClaimRedirectApprovedForAll
// state.hasNftApproval    — isApprovedForAll
// state.isFullyAutomated  — both true
```

Approve a conduit for a specific veNFT (or `tokenId: 0` for account-level):

```typescript
// → send calldata to the veToken contract
const { calldata } = AccountAutomation.setConduitApprovalCallParameters({
  tokenId: 42,               // or 0 for account-level
  conduitAddress: '0xConduitAddress',
  approve: true,             // false to revoke
});
```

veMaxi conduits re-lock rewards as a new veNFT, so they also require ERC721 operator approval:

```typescript
// Only needed for veMaxi conduits — send calldata to the veToken contract
const { calldata } = AccountAutomation.setApprovalForAllCallParameters({
  operator: '0xConduitAddress',
  approved: true,
});
```

Optionally route payouts to a specific address:

```typescript
// → send calldata to the conduit contract (not veToken)
const { calldata } = AccountAutomation.setMyPayoutRecipientCallParameters({
  recipient: '0xRecipientWallet',
});

// Read the current payout recipient
// readContract must be bound to the conduit contract
const recipient = await AccountAutomation.getPayoutRecipient(
  '0xOwnerWallet',
  readContract,
);
```

#### Liquid (gauge) automation

Liquid automation requires four approvals across three contracts. Use `automateGaugesCallParameters` to build them all at once:

```typescript
const params = AccountAutomation.automateGaugesCallParameters(
  '0xLpConduitAddress',
  '0xOwnerWallet',
  true,  // true to enable, false to revoke
);

// Route each call to the correct contract:
// params.veTokenCalls[0]      → veToken           setApprovalForAll
// params.veTokenCalls[1]      → veToken           setConduitApproval (tokenId = 0)
// params.merklDistributorCall → merklDistributor  toggleOperator
// params.optionsTokenCall     → optionsToken      approve
```

> **Important:** `merklDistributor.toggleOperator` flips state rather than accepting an explicit boolean. Only submit this bundle when the current Merkl operator state is the opposite of your intent. Check first with `getLiquidAutomationApprovalState`.

Read all four approval axes at once:

```typescript
// Each read function must be bound to its respective contract
const state = await AccountAutomation.getLiquidAutomationApprovalState(
  '0xOwnerWallet',
  '0xLpConduitAddress',
  readVeTokenContracts,       // bound to veToken
  readMerklOperatorContract,  // bound to merklDistributor
  readOptionsTokenAllowance,  // bound to optionsToken
);
// state.hasClaimApproval         — veToken.isClaimRedirectApprovedForAll
// state.hasNftApproval           — veToken.isApprovedForAll
// state.hasMerklOperatorApproval — merklDistributor.operators
// state.hasOptionsTokenApproval  — optionsToken.allowance > 0
// state.isFullyAutomated         — all four true
```

Build individual calls if you need to re-submit only a specific approval:

```typescript
// Merkl operator toggle — only submit when current state ≠ desired state
const { calldata } = AccountAutomation.setMerklOperatorCallParameters({
  userAddress: '0xOwnerWallet',
  conduitAddress: '0xLpConduitAddress',
});

// Options token approval — omit `amount` for MAX_UINT256; pass 0 to revoke
const { calldata } = AccountAutomation.approveOptionsTokenCallParameters({
  conduitAddress: '0xLpConduitAddress',
  // amount: 0,  // pass to revoke
});
```

---

### Ichi Single-Sided Vaults

Hydrex integrates with Ichi single-sided vaults that rebalance liquidity automatically. All user transactions target the Deposit Guard contract, not the vault directly.

#### Reading vault state with `IchiVault`

```typescript
import { IchiVault, IchiVaultInfo } from '@hydrexfi/hydrex-sdk';

// Read all vault state in one batched call
// readContracts must be bound to the vault contract address
const info: IchiVaultInfo = await IchiVault.getVaultInfo(readContracts);
// info.token0, token1, allowToken0, allowToken1, deposit0Max, deposit1Max,
//   totalSupply, total0, total1, fee

// Check whether deposits are paused
const paused: boolean = IchiVault.isDepositsPaused(info);

// Estimate minimum LP shares to request (fallback, no simulation)
const minShares: bigint = IchiVault.estimateDepositShares(
  depositAmountUSD,  // deposit value in USD
  vaultTVLUSD,       // total vault TVL in USD
  info.totalSupply,
  50,                // slippage in bps (floored at 500 bps)
);

// Estimate minimum token amounts for a withdrawal (fallback, no simulation)
const { amount0, amount1 } = IchiVault.estimateWithdrawAmounts(
  sharesToBurn,
  info.total0,
  info.total1,
  info.totalSupply,
  50,                // slippage in bps (floored at 500 bps)
);

// Apply slippage to a simulated result
const minAmount: bigint = IchiVault.applySlippage(simulatedAmount, 50);
```

#### Depositing and withdrawing with `IchiVaultDepositGuard`

All transactions target `ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES[chainId]`.

```typescript
import {
  IchiVaultDepositGuard,
  ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES,
  ICHI_VAULT_DEPLOYER_ADDRESSES,
  ChainId,
} from '@hydrexfi/hydrex-sdk';

// ERC20 deposit — approve Deposit Guard for `amount` of the deposit token first
const { calldata, value } = IchiVaultDepositGuard.buildDepositCallParameters({
  vault: '0xVaultAddress',
  vaultDeployer: ICHI_VAULT_DEPLOYER_ADDRESSES[ChainId.Base],
  token: '0xDepositToken',
  amount: '1000000000000000000',
  minimumProceeds: minShares,   // from estimateDepositShares or applySlippage
  recipient: '0xYourWallet',
});

// Native ETH deposit — no approval needed; send `amount` as tx.value
const { calldata, value } = IchiVaultDepositGuard.buildNativeDepositCallParameters({
  vault: '0xVaultAddress',
  vaultDeployer: ICHI_VAULT_DEPLOYER_ADDRESSES[ChainId.Base],
  amount: '1000000000000000000',
  minimumProceeds: minShares,
  recipient: '0xYourWallet',
});

// ERC20 withdrawal — approve Deposit Guard for `shares` of the vault share token first
const { calldata, value } = IchiVaultDepositGuard.buildWithdrawCallParameters({
  vault: '0xVaultAddress',
  vaultDeployer: ICHI_VAULT_DEPLOYER_ADDRESSES[ChainId.Base],
  shares: '500000000000000000',
  recipient: '0xYourWallet',
  minAmount0: amount0,  // from estimateWithdrawAmounts or applySlippage
  minAmount1: amount1,
});

// Native ETH withdrawal — WETH is automatically unwrapped to ETH
const { calldata, value } = IchiVaultDepositGuard.buildNativeWithdrawCallParameters({
  vault: '0xVaultAddress',
  vaultDeployer: ICHI_VAULT_DEPLOYER_ADDRESSES[ChainId.Base],
  shares: '500000000000000000',
  recipient: '0xYourWallet',
  minAmount0: amount0,
  minAmount1: amount1,
});
```

---

### Injected Contract Reads

The SDK uses an injected read pattern so you can use any web3 library (viem, ethers, wagmi, etc.). The `ReadContractFunction` and `ReadContractsFunction` types describe what the SDK expects.

```typescript
import type { ReadContractFunction, ReadContractsFunction } from '@hydrexfi/hydrex-sdk';

// Example with viem
const readContract: ReadContractFunction = ({ functionName, args }) =>
  viemClient.readContract({ address: contractAddress, abi, functionName, args });

const readContracts: ReadContractsFunction = (calls) =>
  Promise.all(calls.map(({ functionName, args }) =>
    viemClient.readContract({ address: contractAddress, abi, functionName, args })
  ));
```

---

## Utility Functions

### Amount / Price Parsing

```typescript
import { tryParseAmount, tryParsePrice, tryParseTick } from '@hydrexfi/hydrex-sdk';

const amount = tryParseAmount('1.5', USDC);          // CurrencyAmount | undefined
const price  = tryParsePrice(USDC, WETH, '0.0005');  // Price | undefined
const tick   = tryParseTick(USDC, WETH, fee, '0.0005'); // number | undefined
```

### Max Spend

```typescript
import { maxAmountSpend } from '@hydrexfi/hydrex-sdk';

// For native ETH, subtracts a ~0.01 ETH gas reserve
const safeAmount = maxAmountSpend(ethAmount);
```

### Unwrap WETH to Native

```typescript
import { unwrappedToken } from '@hydrexfi/hydrex-sdk';

// Maps WNATIVE to Native.onChain; other tokens are returned unchanged
const currency = unwrappedToken(WETH); // => Native (ETH)
```

### Retry

```typescript
import { retry, RetryableError } from '@hydrexfi/hydrex-sdk';

const { promise, cancel } = retry(
  async () => { /* your async operation */ },
  { n: 3, minWait: 500, maxWait: 2000 }
);
```

### Tick Utilities

```typescript
import { nearestUsableTick, tickToPrice, priceToClosestTick, getTickToPrice, TickMath } from '@hydrexfi/hydrex-sdk';

const tick = nearestUsableTick(rawTick, tickSpacing);
const price = tickToPrice(token0, token1, tick);
const closestTick = priceToClosestTick(price);

const sqrtRatio = TickMath.getSqrtRatioAtTick(tick);
const tickFromRatio = TickMath.getTickAtSqrtRatio(sqrtRatio);
```

### Pool Address Utilities

```typescript
import { encodeSqrtRatioX96, encodeRouteToPath } from '@hydrexfi/hydrex-sdk';

const sqrtRatio = encodeSqrtRatioX96(amount1, amount0);
const path = encodeRouteToPath(route, exactOutput);
```

### Formatting Helpers

```typescript
import {
  formatCurrencyAmount,
  formatPrice,
  formatPercent,
  formatNumber,
  formatNumberScale,
  formatBalance,
  formatK,
  shortenAddress,
  shortenString,
  capitalize,
  formatDateAgo,
  formatEpochDuration,
  formatTimeUntilEpochFlip,
} from '@hydrexfi/hydrex-sdk';
```

### Epoch Utilities

```typescript
import { buildEpochDetails } from '@hydrexfi/hydrex-sdk';
import type { EpochDetails } from '@hydrexfi/hydrex-sdk';

const epoch: EpochDetails = buildEpochDetails(epochDuration, epochTimestamp, options);
```

---

## ABIs

The package exports the contract ABIs for direct use with ethers.js or viem:

```typescript
import {
  gaugeABI,
  hydrexPositionManagerABI,
  hydrexSwapRouterABI,
  ichiVaultABI,
  ichiVaultDepositGuardABI,
  selfPermitABI,
  veTokenLensABI,
  voterABI,
} from '@hydrexfi/hydrex-sdk';
```

---

## Constants

```typescript
import {
  ChainId,
  POOL_DEPLOYER_ADDRESSES,
  POOL_INIT_CODE_HASH,
  NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
  SWAP_ROUTER_ADDRESSES,
  VOTER_ADDRESSES,
  VE_TOKEN_LENS_ADDRESSES,
  ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES,
  ICHI_VAULT_DEPLOYER_ADDRESSES,
  WNATIVE,
  ADDRESS_ZERO,
  INITIAL_POOL_FEE,
  DEFAULT_TICK_SPACING,
} from '@hydrexfi/hydrex-sdk';

// Chain IDs
ChainId.Base         // 8453
ChainId.BaseSepolia  // 84532

// Contract addresses (Base mainnet)
POOL_DEPLOYER_ADDRESSES[ChainId.Base]              // 0x1595A5D101d69D2a2bAB2976839cC8eeEb13Ab94
NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[ChainId.Base] // 0xC63E9672f8e93234C73cE954a1d1292e4103Ab86
SWAP_ROUTER_ADDRESSES[ChainId.Base]                // 0x6f4bE24d7dC93b6ffcBAb3Fd0747c5817Cea3F9e
VOTER_ADDRESSES[ChainId.Base]                      // 0xc69E3eF39E3fFBcE2A1c570f8d3ADF76909ef17b
VE_TOKEN_LENS_ADDRESSES[ChainId.Base]              // 0xF4d3fCA00640F5bEb7480AA113ED7B0C2c366866
ICHI_VAULT_DEPOSIT_GUARD_ADDRESSES[ChainId.Base]   // 0x9A0EBEc47c85fD30F1fdc90F57d2b178e84DC8d8
ICHI_VAULT_DEPLOYER_ADDRESSES[ChainId.Base]        // 0x7d11De61c219b70428Bb3199F0DD88bA9E76bfEE

// WETH on Base (0x4200000000000000000000000000000000000006)
const weth = WNATIVE[ChainId.Base];

// Pool init code hash (same on both networks)
POOL_INIT_CODE_HASH[ChainId.Base]
// => 0xa18736c3ee97fe3c96c9428c0cc2a9116facec18e84f95f9da30543f8238a782

// Pool defaults
INITIAL_POOL_FEE     // 100
DEFAULT_TICK_SPACING // 60
```

---

## Enums

```typescript
import {
  TradeType,
  Rounding,
  Field,
  Bound,
  Strategist,
  StrategyType,
  LiquidityType,
} from '@hydrexfi/hydrex-sdk';

TradeType.EXACT_INPUT   // 0
TradeType.EXACT_OUTPUT  // 1

Rounding.ROUND_DOWN
Rounding.ROUND_HALF_UP
Rounding.ROUND_UP

Field.CURRENCY_A
Field.CURRENCY_B

Bound.LOWER
Bound.UPPER
```

---

## Development

```bash
# Install dependencies
npm install      # or: yarn

# Build
npm run build    # or: yarn build

# Watch mode
npm start        # or: yarn start

# Lint
npm run lint     # or: yarn lint
```

## License

MIT © Hydrex
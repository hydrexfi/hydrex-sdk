# Hydrex SDK

A TypeScript SDK for interacting with the Hydrex concentrated-liquidity AMM on Base Sepolia.

## Overview

The Hydrex SDK provides tools to:

- Compute pool addresses
- Model pools, positions, routes, and trades
- Build calldata for swaps via the swap router
- Build calldata for liquidity management via the position manager
- Work with ERC4626 "boosted" token vaults

## Installation

```bash
npm install @hydrex/sdk
# or
yarn add @hydrex/sdk
```

## Supported Networks

| Network      | Chain ID |
|--------------|----------|
| Base Sepolia | 84532    |

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
} from '@hydrex/sdk';
```

## Core Concepts

### Tokens

```typescript
import { Token, ChainId } from '@hydrex/sdk';

const USDC = new Token(
  ChainId.BaseSepolia,
  '0xYourUSDCAddress',
  6,
  'USDC',
  'USD Coin'
);

const WETH = WNATIVE[ChainId.BaseSepolia];
```

### Computing Pool Addresses

```typescript
import { computePoolAddress, ChainId } from '@hydrex/sdk';

const poolAddress = computePoolAddress({
  tokenA: USDC,
  tokenB: WETH,
});
```

For pools deployed by a custom deployer:

```typescript
import { computeCustomPoolAddress } from '@hydrex/sdk';

const customPoolAddress = computeCustomPoolAddress({
  tokenA: USDC,
  tokenB: WETH,
  customPoolDeployer: '0xYourCustomDeployer',
});
```

### Creating a Pool Instance

```typescript
import { Pool, INITIAL_POOL_FEE, DEFAULT_TICK_SPACING } from '@hydrex/sdk';

const pool = new Pool(
  USDC,
  WETH,
  INITIAL_POOL_FEE, // pool fee tier
  sqrtRatioX96,     // current sqrt price
  liquidity,        // current in-range liquidity
  tickCurrent,      // current tick
  ticks             // tick data provider or array
);
```

### Swapping

Build calldata for an exact-input swap:

```typescript
import { Trade, Route, SwapRouter, TradeType, Percent, CurrencyAmount } from '@hydrex/sdk';

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
  feeOnTransfer: false,
});

// Send transaction to the swap router contract
```

### Managing Liquidity

#### Minting a new position

```typescript
import { Position, NonfungiblePositionManager, Percent, DEFAULT_TICK_SPACING } from '@hydrex/sdk';

const position = Position.fromAmounts({
  pool,
  tickLower: nearestUsableTick(tickCurrent - DEFAULT_TICK_SPACING * 10, DEFAULT_TICK_SPACING),
  tickUpper: nearestUsableTick(tickCurrent + DEFAULT_TICK_SPACING * 10, DEFAULT_TICK_SPACING),
  amount0: '1000000',
  amount1: '500000000000000000',
  useFullPrecision: true,
});

const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, {
  slippageTolerance: new Percent(50, 10_000),
  recipient: '0xYourWallet',
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

### Boosted Tokens (ERC4626 Vaults)

Hydrex supports ERC4626 vault-wrapped tokens as first-class entities for routing:

```typescript
import { BoostedToken, BoostedRoute } from '@hydrex/sdk';

const mwETH = new BoostedToken(
  ChainId.BaseSepolia,
  '0xYourVaultAddress',
  18,
  'mwETH',
  'Morpho Wrapped ETH',
  WETH // underlying token
);

// A BoostedRoute automatically handles the wrap/unwrap steps
const boostedRoute = new BoostedRoute([pool], USDC, mwETH);
```

## ABIs

The package exports the contract ABIs for direct use with ethers.js or viem:

```typescript
import { hydrexSwapRouterABI, hydrexPositionManagerABI, selfPermitABI } from '@hydrex/sdk';
```

## Constants

```typescript
import {
  ChainId,
  POOL_DEPLOYER_ADDRESSES,
  POOL_INIT_CODE_HASH,
  WNATIVE,
  ADDRESS_ZERO,
  INITIAL_POOL_FEE,
  DEFAULT_TICK_SPACING,
} from '@hydrex/sdk';

// Base Sepolia WETH
const weth = WNATIVE[ChainId.BaseSepolia];

// Hydrex deployment constants — values populated once contracts are available
const deployer = POOL_DEPLOYER_ADDRESSES[ChainId.BaseSepolia];
const initCodeHash = POOL_INIT_CODE_HASH[ChainId.BaseSepolia];
```

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

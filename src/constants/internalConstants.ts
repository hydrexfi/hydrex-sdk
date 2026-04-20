import JSBI from 'jsbi';

// These constants are used internally and are not part of the public API.

export const NEGATIVE_ONE = JSBI.BigInt(-1);
export const ZERO = JSBI.BigInt(0);
export const ONE = JSBI.BigInt(1);

// Q96 and Q192 are fixed-point scaling factors used in sqrt-price and liquidity math.
export const Q96 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(96));
export const Q192 = JSBI.exponentiate(Q96, JSBI.BigInt(2));

/** Maximum value of a uint256, used as an unlimited-amount sentinel. */
export const MaxUint256 = JSBI.BigInt(
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
);

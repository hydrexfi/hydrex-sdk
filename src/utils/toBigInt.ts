import JSBI from 'jsbi';

export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  if (value instanceof JSBI) return BigInt(value.toString());
  if (value !== null && typeof value === 'object') {
    return BigInt((value as { toString(): string }).toString());
  }

  throw new Error(`Unable to convert value to bigint: ${String(value)}`);
}

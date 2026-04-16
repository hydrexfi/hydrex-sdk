import JSBI from 'jsbi';

// Shared integer input type used across the SDK for contract parameters and
// read helper inputs. Native bigint values are normalized separately where
// needed, while JSBI, numbers, and strings can be passed directly.
export type BigintIsh = JSBI | number | string;

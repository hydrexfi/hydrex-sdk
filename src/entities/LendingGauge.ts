import { Strategist, isTokenBasedStrategist } from '../enums/strategist';
import { validateAndParseAddress } from '../utils/validateAndParseAddress';
import { Token } from './Token';

/**
 * Describes a Hydrex lending gauge position — a strategy backed by a
 * single-sided lending protocol (Morpho, Euler, etc.) whose deposit and
 * stake token is a receipt/share token for the underlying asset.
 *
 * Use this to derive the correct decimals for parseUnits/formatUnits and to
 * identify which Gauge class methods to call.
 */
export class LendingGauge {
  /** The strategy/vault token that is deposited into the gauge. */
  public readonly token: Token;

  /** On-chain address of the Hydrex gauge contract. */
  public readonly gaugeAddress: string;

  /** The lending protocol that manages the underlying position. */
  public readonly strategist: Strategist;

  public constructor(token: Token, gaugeAddress: string, strategist: Strategist) {
    if (!isTokenBasedStrategist(strategist)) {
      throw new Error(`LendingGauge requires a token-based strategist. Got: ${strategist}`);
    }
    this.token = token;
    this.gaugeAddress = validateAndParseAddress(gaugeAddress);
    this.strategist = strategist;
  }

  /**
   * Decimals to use when calling parseUnits/formatUnits on stake amounts.
   * For lending gauges, stake amounts use the deposit token's decimals
   * (never 18) because the stake token is a 1:1 receipt/share token.
   */
  public get decimals(): number {
    return this.token.decimals;
  }

  public get isMorpho(): boolean {
    return this.strategist === Strategist.MORPHO;
  }

  public get isEuler(): boolean {
    return this.strategist === Strategist.EULER;
  }
}

import JSBI from 'jsbi';
import { Voter } from '../src/classes/voter';

describe('Voter', () => {
  const pools = [
    '0x0000000000000000000000000000000000000001',
    '0x0000000000000000000000000000000000000002',
    '0x0000000000000000000000000000000000000003',
  ];

  it('encodes vote(address[],uint256[]) call parameters', () => {
    const params = Voter.voteCallParameters({
      pools,
      weights: [1, '2', JSBI.BigInt(3)],
    });

    expect(params).toEqual({
      calldata: Voter.INTERFACE.encodeFunctionData('vote', [
        pools,
        ['0x01', '0x02', '0x03'],
      ]),
      value: '0x00',
    });
  });

  it('encodes poke() call parameters', () => {
    const params = Voter.pokeCallParameters();

    expect(params).toEqual({
      calldata: Voter.INTERFACE.encodeFunctionData('poke'),
      value: '0x00',
    });
  });

  it('encodes reset() call parameters', () => {
    const params = Voter.resetCallParameters();

    expect(params).toEqual({
      calldata: Voter.INTERFACE.encodeFunctionData('reset'),
      value: '0x00',
    });
  });

  it('throws when pools and weights lengths differ', () => {
    expect(() =>
      Voter.voteCallParameters({
        pools: pools.slice(0, 1),
        weights: [1, 2],
      }),
    ).toThrow('LENGTH_MISMATCH');
  });

  it('throws when a pool address is invalid', () => {
    expect(() =>
      Voter.voteCallParameters({
        pools: ['not-an-address'],
        weights: [1],
      }),
    ).toThrow('not-an-address');
  });
});

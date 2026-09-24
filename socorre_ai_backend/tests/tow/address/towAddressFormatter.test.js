/**
 * TOW ROUND — deterministic address formatter (domain).
 *
 * The formatter is the single product rule that turns provider-neutral address
 * components into the `formatted_address` persisted on a TowRequest. These
 * tests pin every rule (A–J), the confidence policy, the `S/N` policy, the
 * deduplication and the normalization — without any provider, network or key.
 *
 * RED-first: written before `domain/address.js` existed.
 */
'use strict';

const {
  formatResolvedAddress,
  normalizeResolvedAddress,
  confidenceOf,
  MAX_FORMATTED_ADDRESS_LENGTH,
} = require('../../../src/modules/tow/domain');

/** A high-confidence, complete Rio Branco-shaped candidate. */
function candidate(overrides = {}) {
  return {
    street: null,
    number: null,
    neighborhood: null,
    city: null,
    state: null,
    state_code: null,
    postal_code: null,
    country: null,
    location_type: 'ROOFTOP',
    partial_match: false,
    ...overrides,
  };
}

const FLORESTA_SUL = Object.freeze({
  street: 'Rua Bartholomeu',
  number: '125',
  neighborhood: 'Floresta Sul',
  city: 'Rio Branco',
  state: 'Acre',
  state_code: 'AC',
  location_type: 'ROOFTOP',
});

describe('TOW ROUND — address formatter', () => {
  describe('rules A–J', () => {
    test('A — street + number + neighborhood', () => {
      expect(formatResolvedAddress(candidate(FLORESTA_SUL)))
        .toBe('Rua Bartholomeu, 125 - Floresta Sul');
    });

    test('B — street + no number + neighborhood becomes S/N', () => {
      expect(formatResolvedAddress(candidate({ ...FLORESTA_SUL, number: null })))
        .toBe('Rua Bartholomeu, S/N - Floresta Sul');
    });

    test('C — street + number', () => {
      expect(formatResolvedAddress(candidate({ ...FLORESTA_SUL, neighborhood: null })))
        .toBe('Rua Bartholomeu, 125');
    });

    test('D — street only becomes S/N', () => {
      expect(formatResolvedAddress(candidate({ ...FLORESTA_SUL, number: null, neighborhood: null })))
        .toBe('Rua Bartholomeu, S/N');
    });

    test('E — neighborhood + city + state', () => {
      expect(formatResolvedAddress(candidate({
        neighborhood: 'Floresta Sul', city: 'Rio Branco', state: 'Acre', state_code: 'AC',
      }))).toBe('Floresta Sul - Rio Branco, AC');
    });

    test('F — neighborhood only', () => {
      expect(formatResolvedAddress(candidate({ neighborhood: 'Floresta Sul' }))).toBe('Floresta Sul');
    });

    test('G — city + state', () => {
      expect(formatResolvedAddress(candidate({ city: 'Rio Branco', state: 'Acre', state_code: 'AC' })))
        .toBe('Rio Branco - AC');
    });

    test('H — city only', () => {
      expect(formatResolvedAddress(candidate({ city: 'Rio Branco' }))).toBe('Rio Branco');
    });

    test('I — state only prefers the short code, falls back to the long name', () => {
      expect(formatResolvedAddress(candidate({ state: 'Acre', state_code: 'AC' }))).toBe('AC');
      expect(formatResolvedAddress(candidate({ state: 'Acre' }))).toBe('Acre');
    });

    test('J — no useful components is null, never a coordinate', () => {
      expect(formatResolvedAddress(candidate())).toBeNull();
      expect(formatResolvedAddress(null)).toBeNull();
      expect(formatResolvedAddress(undefined)).toBeNull();
      expect(formatResolvedAddress('not-an-object')).toBeNull();
      expect(formatResolvedAddress([])).toBeNull();
    });
  });

  describe('normalization', () => {
    test('components are trimmed and internal whitespace collapsed', () => {
      expect(formatResolvedAddress(candidate({
        street: '  Rua   Bartholomeu ',
        number: ' 125 ',
        neighborhood: '  Floresta   Sul ',
        location_type: 'ROOFTOP',
      }))).toBe('Rua Bartholomeu, 125 - Floresta Sul');
    });

    test('null, empty and whitespace components are all equivalent to absent', () => {
      const formatted = formatResolvedAddress(candidate({
        street: 'Rua Bartholomeu',
        number: '   ',
        neighborhood: '',
        city: null,
        state: 'Acre',
        state_code: ' ',
      }));
      expect(formatted).toBe('Rua Bartholomeu, S/N');
    });

    test('a value longer than the persisted column is capped defensively', () => {
      const formatted = formatResolvedAddress(candidate({
        street: 'R'.repeat(600),
        location_type: 'ROOFTOP',
      }));
      expect(formatted).toHaveLength(MAX_FORMATTED_ADDRESS_LENGTH);
    });
  });

  describe('deduplication', () => {
    test('neighborhood repeated as city is emitted once', () => {
      expect(formatResolvedAddress(candidate({
        neighborhood: 'Rio Branco', city: 'Rio Branco', state: 'Acre', state_code: 'AC',
      }))).toBe('Rio Branco - AC');
    });

    test('neighborhood repeated as the street is emitted once', () => {
      expect(formatResolvedAddress(candidate({
        street: 'Floresta Sul', number: '125', neighborhood: 'Floresta Sul', location_type: 'ROOFTOP',
      }))).toBe('Floresta Sul, 125');
    });

    test('a city repeated as the state long name does not duplicate', () => {
      expect(formatResolvedAddress(candidate({
        city: 'Acre', state: 'Acre', state_code: 'AC',
      }))).toBe('AC');
    });
  });

  describe('confidence policy', () => {
    test('ROOFTOP and RANGE_INTERPOLATED are high confidence', () => {
      expect(confidenceOf(normalizeResolvedAddress(candidate({ location_type: 'ROOFTOP' })))).toBe('high');
      expect(confidenceOf(normalizeResolvedAddress(candidate({ location_type: 'RANGE_INTERPOLATED' })))).toBe('high');
    });

    test('GEOMETRIC_CENTER, APPROXIMATE and partial_match are low confidence', () => {
      expect(confidenceOf(normalizeResolvedAddress(candidate({ location_type: 'GEOMETRIC_CENTER' })))).toBe('low');
      expect(confidenceOf(normalizeResolvedAddress(candidate({ location_type: 'APPROXIMATE' })))).toBe('low');
      expect(confidenceOf(normalizeResolvedAddress(candidate({ partial_match: true })))).toBe('low');
    });

    test('a missing location_type is unknown confidence', () => {
      expect(confidenceOf(normalizeResolvedAddress(candidate({ location_type: null })))).toBe('unknown');
    });

    test('APPROXIMATE discards street/number and keeps real territorial components', () => {
      expect(formatResolvedAddress(candidate({
        ...FLORESTA_SUL,
        location_type: 'APPROXIMATE',
      }))).toBe('Floresta Sul - Rio Branco, AC');
    });

    test('partial_match discards street/number and keeps real territorial components', () => {
      expect(formatResolvedAddress(candidate({
        ...FLORESTA_SUL,
        partial_match: true,
      }))).toBe('Floresta Sul - Rio Branco, AC');
    });

    test('GEOMETRIC_CENTER keeps a real street but never infers S/N', () => {
      expect(formatResolvedAddress(candidate({
        ...FLORESTA_SUL,
        number: null,
        location_type: 'GEOMETRIC_CENTER',
      }))).toBe('Rua Bartholomeu - Floresta Sul');
    });

    test('a missing location_type keeps a real street but never infers S/N', () => {
      expect(formatResolvedAddress(candidate({
        ...FLORESTA_SUL,
        number: null,
        location_type: null,
      }))).toBe('Rua Bartholomeu - Floresta Sul');
    });
  });

  describe('S/N policy', () => {
    test('S/N requires a successful high-confidence answer with a street and no number', () => {
      expect(formatResolvedAddress(candidate({
        street: 'Rua Bartholomeu', number: null, location_type: 'ROOFTOP',
      }))).toBe('Rua Bartholomeu, S/N');
      expect(formatResolvedAddress(candidate({
        street: 'Rua Bartholomeu', number: null, location_type: 'RANGE_INTERPOLATED',
      }))).toBe('Rua Bartholomeu, S/N');
    });

    test('a failed resolution (null candidate) never produces S/N', () => {
      expect(formatResolvedAddress(null)).toBeNull();
    });

    test('a candidate with no street never produces S/N', () => {
      expect(formatResolvedAddress(candidate({
        neighborhood: 'Floresta Sul', city: 'Rio Branco', state_code: 'AC',
      }))).toBe('Floresta Sul - Rio Branco, AC');
    });
  });
});

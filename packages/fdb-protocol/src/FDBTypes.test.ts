import { Type } from 'io-ts';

import * as types from './FDBTypes';

function testAType<S, A>(
  description: string,
  type: Type<S, A>,
  vectors: {
    accepts: { [key: string]: any },
    rejects: { [key: string]: any },
  },
) {
  describe(description, () => {
    for (const [desc, vector] of Object.entries(vectors.accepts)) {
      it(`accepts ${desc}`, () => expect(type.is(vector)).toBe(true));
    }

    for (const [desc, vector] of Object.entries(vectors.rejects)) {
      it(`rejects ${desc}`, () => expect(type.is(vector)).toBe(false));
    }
  });
}

testAType('NonNegativeInteger', types.NonNegativeInteger, {
  accepts: {
    'the value zero': 0,
    'a positive integer': 3,
  },

  rejects: {
    'a negative integer': -1,
    'a positive fraction': 3.14,
    'a negative fraction': -5.01,
  },
});

testAType('PositiveInteger', types.PositiveInteger, {
  accepts: {
    'a positive integer': 1,
    'a large positive integer': 123456789,
  },
  rejects: {
    'the value zero': 0,
    'a positive fraction': 3 / 4,
    'a large positive fraction': 543.21,
    'a negative integer': -123,
    'a negative fraction': -3.14,
  },
});

testAType('ObjectURI', types.ObjectURI, {
  accepts: { 'a well-formed URI': 'foo://a.b.c/d?e' },
  rejects: { 'a non-string': 3 },
});

testAType('AppFileURI', types.AppFileURI, {
  accepts: { 'a well-formed app URI': 'app:///path/to/a/file.js' },
  rejects: { 'a URI whose scheme is not app': 'http://example.com/file.js' },
});

testAType('UUID', types.UUID, {
  accepts: {
    'a UUID string in canonical form': '6cda84fb-3265-4493-94cb-e0ef409bf782',
  },
  rejects: {
    'a UUID string with braces': '{6cda84fb-3265-4493-94cb-e0ef409bf782}',
    'a hex string without dashes': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'a totally bogus string': 'definitely not',
  },
});

testAType('BuildID', types.BuildID, {
  accepts: {
    'a string of sixteen lowercase hex digits': '1234567890abcdef',
    'a string of sixteen mixed case hex digits': '1234567890aBCDef',
  },
  rejects: {
    'a string which is too short': '1234567890abcde',
    'a string with non-hex chars': '123456789abcdefg',
    'a string with trailing spaces': '123456789abcdef ',
  },
});

describe('Semver', () => {
  describe.each([
    ['1.2.3', '1.2.3'],
    ['v4.5.6', '4.5.6'],
    ['1.2.3-alpha.5.delta-gamma.17+12345', '1.2.3-alpha.5.delta-gamma.17'],
  ])('given %j', (version, expected) => {
    it('is valid', () => expect(types.Semver.is(version)).toBe(true));
    it(`decodes to ${expected}`, () =>
      expect(types.Semver.decode(version)
        .getOrElseL((() => { throw new Error('decode error'); })),
      ).toBe(expected));
  });

  describe.each(['01.2.3', '', '1.2', 'asdf', 3])('rejects %j', (value) => {
    test('in .is()', () => expect(types.Semver.is(value)).toBe(false));
    test('in .decode()', () => expect(types.Semver.decode(value).isLeft()).toBeTruthy());
  });
});

testAType('ReleaseSemver', types.ReleaseSemver, {
  accepts: {
    'a release semver': '1.2.3',
    'release semver with build metadata': '1.2.3+abc-456',
  },
  rejects: {
    'a pre-release semver': '1.2.3-4',
  },
});

import maxBase64DecodedSize from './maxBase64DecodedSize';

describe('maxDecodedSize', () => {
  const expected: number[] = [0, 0, 0, 0, 3, 3, 3, 3, 6, 6, 6, 6, 9];
  it('is tested with correct test vectors', () =>
    expected.forEach((binary, encoded) => {
      expect(
        Buffer.alloc(binary).toString('base64').length,
      ).toBeLessThanOrEqual(encoded);
      expect(
        Buffer.alloc(binary + 1).toString('base64').length,
      ).toBeGreaterThan(encoded);
    }));
  expected.forEach((output, input) =>
    it(`works for encodedLength = ${input}`, () =>
      expect(maxBase64DecodedSize(input)).toBe(output)),
  );
});

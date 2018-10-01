/**
 * How many octets of binary data can we base64-encode if the base64-
 * encoded string cannot exceed a certain length?
 *
 * @param encodedLimit max size of the base64-encoded string
 */
export default function maxBase64DecodedSize(encodedLimit: number) {
  return 3 * Math.floor(encodedLimit / 4);
}

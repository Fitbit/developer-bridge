const mapValues = <T, U>(
  obj: { [s: string]: T },
  mapper: (value: T, key: string, index: number) => Promise<U> | U,
) =>
  Promise.all(
    Object.entries(obj).map(async ([key, value], index) => ({
      [key]: await mapper(value, key, index),
    })),
  ).then((entries) => entries.reduce((a, b) => ({ ...a, ...b }), {}));

export default mapValues;

declare function map<T, TResult>(
  input: T[],
  iteratee: (value: T, index: number, collection: T[]) => Promise<TResult>,
): Promise<TResult[]>;

declare function map<T, TResult, Input extends Iterable<T>>(
  input: Input,
  iteratee: (value: T, index: number, collection: Input) => Promise<TResult>,
): Promise<TResult[]>;

declare function map<T extends object, TResult>(
  input: T,
  iteratee: (value: T[keyof T], index: string, collection: T) => Promise<TResult>,
): Promise<{ [K in keyof T]: TResult }>;

export default map;

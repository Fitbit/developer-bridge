import { readFile } from 'fs/promises';

export async function readJsonFile(path: string): Promise<unknown> {
  const contents = await readFile(path, { encoding: 'utf-8' });
  return JSON.parse(contents);
}

export function isInt(n: any): n is number {
  return Number.isInteger(n);
}

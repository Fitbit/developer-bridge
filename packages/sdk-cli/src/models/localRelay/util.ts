import { readFile } from 'fs/promises';

export async function readJsonFile<
  T extends Record<string, any> = Record<string, any>
>(path: string): Promise<Partial<T> | false> {
  let contents: string;

  try {
    contents = await readFile(path, { encoding: 'utf-8' });
  } catch (error) {
    console.log(`Error reading file: ${path}`);
    return false;
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    console.log(`Error parsing JSON in file, path: ${path}`);
    return {};
  }
}

export function isInt(n: any): n is number {
  return !isNaN(parseInt(n)) && n === parseInt(n);
}

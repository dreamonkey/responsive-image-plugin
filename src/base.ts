import { existsSync, mkdirSync } from 'fs';
import { isUndefined, mapKeys } from 'lodash';
import { join, parse, posix } from 'path';
import { Dictionary } from 'ts-essentials';
import { getHashDigest } from './helpers';

// eslint-disable-next-line @typescript-eslint/unbound-method
const { join: posixJoin } = posix;

export interface ViewportAliasesMap {
  [index: string]: string;
}

interface PathsConfig {
  outputDir: string;
  aliases: Dictionary<string>;
}

export interface BaseConfig {
  paths: PathsConfig;
  viewportAliases: ViewportAliasesMap;
  defaultSize: number;
}

let _pathAliases: [string, string][] | undefined;
let _outputDir: string | undefined;

export function setPathsOptions({ outputDir, aliases }: PathsConfig): void {
  _outputDir = outputDir;
  _pathAliases = Object.entries(aliases);
}

export function getPathAliases(): [string, string][] {
  if (isUndefined(_pathAliases)) {
    throw new Error('Path options has not been initialized properly');
  }
  return _pathAliases;
}

export function getOuputDir(): string {
  if (isUndefined(_outputDir)) {
    throw new Error('Path options has not been initialized properly');
  }
  return _outputDir;
}

function resolveAlias(
  viewportName: string,
  aliases: ViewportAliasesMap,
): string {
  return isUndefined(aliases[viewportName])
    ? viewportName
    : aliases[viewportName];
}

export function resolveAliases<T>(
  viewportMap: Dictionary<T>,
  aliases: ViewportAliasesMap,
): Dictionary<T> {
  return mapKeys(viewportMap, (_, name) => resolveAlias(name, aliases));
}

export function guardAgainstDefaultAlias(
  viewportMap: ViewportAliasesMap,
): void {
  if (Object.keys(viewportMap).includes('__default')) {
    throw new Error(
      '"__default" alias is reserved for internal usage, use another name',
    );
  }
}

const TEMP_DIR = join('dist', 'temp');
const TEMP_IMAGES_DIR = join(TEMP_DIR, 'images');

export function existsOrCreateDirectory(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function getTempDir(): string {
  existsOrCreateDirectory(TEMP_DIR);
  return TEMP_DIR;
}

export function getTempImagesDir(): string {
  existsOrCreateDirectory(TEMP_IMAGES_DIR);
  return TEMP_IMAGES_DIR;
}

export enum SupportedImageFormats {
  WebP = 'webp',
  Jpeg = 'jpg',
}

export interface Breakpoint {
  path: string;
  uri: string;
  uriWithHash: string;
  width: number;
}

export interface BaseSource {
  path: string;
  breakpoints: Breakpoint[];
  size: number;
}

export type SizesMap = { __default: number } & Dictionary<number>;

export interface BaseResponsiveImage {
  originalPath: string;
  sources: BaseSource[];
  options: {
    sizes: SizesMap;
  };
}

export function generateUri(
  path: string,
  content: Buffer,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uriBodyGenerator: (...args: any[]) => string,
): { uri: string; uriWithHash: string } {
  const hash = getHashDigest(content);
  const { name: filename, ext: extension } = parse(path);
  // The URI is a relative URL, and as such must always use posix style separators ("/")
  const uriStart = posixJoin(getOuputDir(), filename);
  const uriBody = uriBodyGenerator();

  return {
    uri: uriStart + uriBody + extension,
    uriWithHash: uriStart + uriBody + '.' + hash + extension,
  };
}

import { existsSync, mkdirSync } from 'fs';
import { isUndefined, mapKeys } from 'lodash';
import { join, parse, posix } from 'path';
import { Dictionary } from 'ts-essentials';
import { LiteralUnion } from './helpers';
import ResponsiveImagePlugin from './responsive-image-plugin';

// eslint-disable-next-line @typescript-eslint/unbound-method
export const { join: posixJoin } = posix;

export interface BaseAdapter<Params extends unknown[]> {
  (...params: Params): Promise<Buffer>;
  setup?: (pluginContext: ResponsiveImagePlugin) => void | Promise<void>;
  teardown?: (pluginContext: ResponsiveImagePlugin) => void | Promise<void>;
}

// Slightly different than webpack version, as we filter out entries with `onlyModule` set to true
// and those with an array or false alias value
export interface AliasOption {
  alias: string;
  name: string;
}

export interface ViewportAliasesMap {
  [index: string]: string;
}

export interface BaseConfig {
  dryRun: boolean;
  outputDir: string;
  viewportAliases: ViewportAliasesMap;
  defaultSize: number;
}

function resolveViewportAlias(
  viewportName: string,
  viewportAliases: ViewportAliasesMap,
): string {
  return isUndefined(viewportAliases[viewportName])
    ? viewportName
    : viewportAliases[viewportName];
}

export function resolveViewportAliases<T>(
  viewportMap: Dictionary<T>,
  viewportAliases: ViewportAliasesMap,
): Dictionary<T> {
  return mapKeys(viewportMap, (_, name) =>
    resolveViewportAlias(name, viewportAliases),
  );
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
  width: number;
}

export interface BaseSource {
  path: string;
  breakpoints: Breakpoint[];
  ratio: LiteralUnion<'original'>;
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
  pluginContext: ResponsiveImagePlugin,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uriBodyGenerator: (...args: any[]) => string,
): string {
  const { name: filename, ext: extension } = parse(path);
  // The URI is a relative URL, and as such must always use posix style separators ("/")
  const uriStart = posixJoin(pluginContext.options.outputDir, filename);
  const uriBody = uriBodyGenerator();

  return uriStart + uriBody + extension;
}

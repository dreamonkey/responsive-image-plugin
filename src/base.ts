import { existsSync, mkdirSync } from 'fs';
import { isUndefined, mapKeys } from 'lodash';
import { join, parse, posix } from 'path';
import { Dictionary } from 'ts-essentials';
import { ResponsiveImagePluginConfig } from './config';
import { LiteralUnion } from './helpers';
import { WebpackLogger } from './webpack-logger';

// eslint-disable-next-line @typescript-eslint/unbound-method
export const { join: posixJoin } = posix;

export interface BaseAdapter<Params extends unknown[]> {
  (...params: Params): Promise<Buffer>;
  setup?: () => void | Promise<void>;
  teardown?: () => void | Promise<void>;
}

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

let _logger: WebpackLogger | undefined;
let _options: ResponsiveImagePluginConfig | undefined;

export const pluginContext = {
  get logger(): WebpackLogger {
    if (isUndefined(_logger)) {
      throw new Error('Logger has not been initialized properly');
    }
    return _logger;
  },
  set logger(l: WebpackLogger) {
    _logger = l;
  },

  get options(): ResponsiveImagePluginConfig {
    if (isUndefined(_options)) {
      throw new Error('Options has not been initialized properly');
    }
    return _options;
  },
  set options(o: ResponsiveImagePluginConfig) {
    _options = o;
  },

  get pathAliases(): [string, string][] {
    if (isUndefined(_options)) {
      throw new Error('Options has not been initialized properly');
    }
    return Object.entries(_options.paths.aliases);
  },
};

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
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uriBodyGenerator: (...args: any[]) => string,
): string {
  const { name: filename, ext: extension } = parse(path);
  // The URI is a relative URL, and as such must always use posix style separators ("/")
  const uriStart = posixJoin(pluginContext.options.paths.outputDir, filename);
  const uriBody = uriBodyGenerator();

  return uriStart + uriBody + extension;
}

import { createHash } from 'crypto';
import ResponsiveImagePlugin from './responsive-image-plugin';

// Needed to prevent TS to collapse `'value1' | 'value2' | string` to `string`, which breaks first parameter autocomplete
// See: https://github.com/microsoft/TypeScript/issues/29729#issuecomment-832522611
export type LiteralUnion<T extends U, U = string> =
  | T
  | (U & Record<never, never>);

// DeepReadonly causes too many compibility problems, we avoid it for now,
// runtime will break anyway when trying to mutate any of these objects
// Using a type restriction for T also would cause clashes with Schema types
// and pretty much everything else, trying to use a recursive object won't work
/* object deep freeze function */
export function deepFreeze<T>(object: T): T {
  /* retrieve the property names defined on object */
  const propNames = Object.getOwnPropertyNames(object);

  /* recursively freeze properties before freezing self */
  for (const name of propNames) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const value = (object as any)[name];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    (object as any)[name] =
      value && typeof value === 'object' ? deepFreeze(value) : value;
  }

  /* return frozen object */
  return Object.freeze(object);
}

export function getHashDigest(data: string | Buffer) {
  return createHash('md5').update(data).digest('hex').substring(0, 8);
}

export function addHashToUri(uri: string, content: string | Buffer) {
  const hash = getHashDigest(content);
  const uriSegments = uri.split('.');
  uriSegments.splice(-1, 0, hash);
  return uriSegments.join('.');
}

export function convertRatioStringToNumber(ratio: string) {
  const [horizontalRatio, verticalRatio] =
    ratio === 'original' ? [] : ratio.split(':').map(Number);

  return verticalRatio / horizontalRatio;
}

export function selectFromPreset<
  P extends Record<string, unknown>,
  K extends string,
>(pluginContext: ResponsiveImagePlugin, presetMap: P, option: K): P[K] | null {
  const presetMapKeys = Object.keys(presetMap);

  if (!presetMapKeys.includes(option)) {
    pluginContext.logger.error(
      `Cannot find option "${option}", here's available ones: ${presetMapKeys.join(
        '|',
      )}`,
    );

    return null;
  }

  return presetMap[option];
}

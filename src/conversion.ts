import { fromFile } from 'file-type';
import sizeOf from 'image-size';
import { isNull, isUndefined } from 'lodash';
import { format as formatPath, join, parse } from 'path';
import {
  BaseResponsiveImage,
  BaseSource,
  generateUri,
  pluginContext,
  SupportedImageFormats,
} from './base';
import {
  ConversionAdapter,
  ConversionAdapterPresets,
} from './converters/converters';
import { sharpConverter } from './converters/sharp';
import { deepFreeze, selectFromPreset } from './helpers';
import { ResponsiveImage } from './parsing';
import { TransformationSource } from './transformation';

const PREFERRED_FORMAT_ORDER: string[] = [
  SupportedImageFormats.WebP.toString(),
  SupportedImageFormats.Jpeg.toString(),
];

type ConversionAdapterPresetsMap = {
  [index in ConversionAdapterPresets]: ConversionAdapter;
};

const presetConverters: ConversionAdapterPresetsMap = deepFreeze({
  sharp: sharpConverter,
});

export interface ConversionConfig {
  converter: ConversionAdapterPresets | ConversionAdapter | null;
  enabledFormats: {
    [index in SupportedImageFormats]: boolean;
  };
}

export interface ConversionSource extends BaseSource {
  format: SupportedImageFormats;
}

export interface ConversionResponsiveImage extends BaseResponsiveImage {
  sources: (ConversionSource | (ConversionSource & TransformationSource))[];
}

const SUPPORTED_IMAGES_FORMATS = Object.values(SupportedImageFormats);

function isFormatSupported(format: string): format is SupportedImageFormats {
  return SUPPORTED_IMAGES_FORMATS.includes(format as SupportedImageFormats);
}

// Detect extension by magic numbers instead of path extension (which can lie)
export async function guardAgainstUnsupportedSourceType(
  imagePath: string,
): Promise<void> {
  const type = (await fromFile(imagePath))?.ext;

  if (isUndefined(type)) {
    throw new Error(`Type of ${imagePath} could not be detected`);
  }

  if (!isFormatSupported(type)) {
    throw new Error(
      `Type ${type} is not supported. Supported types: ${SUPPORTED_IMAGES_FORMATS.join(
        ', ',
      )}`,
    );
  }
}

export function byMostEfficientFormat(
  a: ConversionSource,
  b: ConversionSource,
): number {
  return (
    PREFERRED_FORMAT_ORDER.indexOf(a.format) -
    PREFERRED_FORMAT_ORDER.indexOf(b.format)
  );
}

export const generateConversionUri = (
  path: string,
): ReturnType<typeof generateUri> =>
  // 'c' stands for 'converted'
  generateUri(path, () => '-c');

function generateFallbackSource(
  sourcePath: string,
  size: number,
  format: SupportedImageFormats,
): ConversionSource {
  const { name } = parse(sourcePath);
  const uri = generateConversionUri(
    join(pluginContext.options.outputDir, `${name}.${format}`),
  );

  pendingConversions.push([sourcePath, format, uri]);

  return {
    path: sourcePath,
    breakpoints: [
      {
        path: sourcePath,
        uri,
        // TODO: we could use sharp here and into resizig, but it would force us to make everything async
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        width: sizeOf(sourcePath).width!,
      },
    ],
    size,
    ratio: 'original',
    format,
  };
}

function changeExtension(uri: string, format: SupportedImageFormats): string {
  const { dir, name } = parse(uri);

  return (
    formatPath({
      dir,
      name,
      ext: `.${format}`,
    })
      // Using 'dir' generates a string prefixed with '//' instead of '/' when dir and root are both '/'
      // See https://github.com/nodejs/node/issues/22030
      .replace('//', '/')
  );
}

export const pendingConversions: [
  sourceImagePath: string,
  format: SupportedImageFormats,
  uri: string,
][] = [];

export function applyConversions(image: ResponsiveImage): void {
  const { converter, enabledFormats } = pluginContext.options.conversion;

  if (isNull(converter)) {
    image.sources = image.sources.map((source) => ({
      ...source,
      format: parse(source.path).ext.replace('.', ''),
    }));

    return;
  }

  const availableFormats = Object.entries(enabledFormats)
    .filter(([, value]) => value === true)
    .map(([format]) => format) as SupportedImageFormats[];

  image.sources = availableFormats
    .map((format) => {
      // Original image should be processed like all others,
      //  in case some optimizations are applied by the converter

      const convertedSources = image.sources.map((source) => {
        const convertedBreakpoints = source.breakpoints.map(
          ({ path, uri: sourceUri, width }) => {
            const uri = changeExtension(
              generateConversionUri(sourceUri),
              format,
            );
            pendingConversions.push([path, format, uri]);

            return { path, uri, width };
          },
        );

        const convertedSource: ConversionSource = {
          // Retain transformation metadata
          ...source,
          breakpoints: convertedBreakpoints,
          format,
        };

        return convertedSource;
      });

      const fallbackSource = generateFallbackSource(
        image.originalPath,
        image.options.sizes.__default,
        format,
      );

      return [...convertedSources, fallbackSource];
    })
    .reduce((previous, current) => [...previous, ...current], []);
}

export function resolveConverter(converter: ConversionConfig['converter']) {
  if (typeof converter === 'string') {
    converter = selectFromPreset(presetConverters, converter);
  }

  return converter;
}

import { fromFile } from 'file-type';
import { isNull, isUndefined } from 'lodash';
import { format as formatPath, join, parse } from 'path';
import {
  ConversionAdapter,
  ConversionAdapterPresets,
} from './converters/converters';
import { sharpConverter } from './converters/sharp';
import { deepFreeze, selectFromPreset } from './helpers';
import {
  BaseResponsiveImage,
  BaseSource,
  generateUri,
  getTempImagesDir,
  SupportedImageFormats,
  getOuputDir,
} from './base';
import { TransformationSource } from './transformation';
import { ResponsiveImageLoaderContext } from './config';

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
async function detectSourceType(
  imagePath: string,
): Promise<SupportedImageFormats> {
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

  return type;
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
  content: Buffer,
): ReturnType<typeof generateUri> =>
  // 'c' stands for 'converted'
  generateUri(path, content, () => '-c');

async function generateFallbackSource(
  this: ResponsiveImageLoaderContext,
  converter: ConversionAdapter,
  sourcePath: string,
  size: number,
  format: SupportedImageFormats,
): Promise<ConversionSource> {
  const { name } = parse(sourcePath);
  const destinationPath = join(getTempImagesDir(), `${name}.${format}`);
  const uri = join(getOuputDir(), `${name}.${format}`);

  const fallbackBreakpoint = await converter.call(
    this,
    sourcePath,
    destinationPath,
    uri,
    format,
  );

  return {
    path: sourcePath,
    breakpoints: [fallbackBreakpoint],
    size,
    format,
  };
}

function changeExtension(
  pathOrUri: string,
  format: SupportedImageFormats,
): string {
  const { dir, name } = parse(pathOrUri);
  return formatPath({
    dir,
    name,
    ext: `.${format}`,
  });
}

export async function convertImage(
  this: ResponsiveImageLoaderContext,
  responsiveImage: BaseResponsiveImage,
  { converter, enabledFormats }: ConversionConfig,
): Promise<ConversionResponsiveImage> {
  if (typeof converter === 'string') {
    try {
      converter = selectFromPreset(presetConverters, converter);
    } catch (e) {
      this.emitError(e as Error);
      converter = null;
    }
  }

  if (isNull(converter)) {
    responsiveImage.sources = await Promise.all(
      responsiveImage.sources.map(async (source) => ({
        ...source,
        format: await detectSourceType(source.path),
      })),
    );

    return Promise.resolve(responsiveImage as ConversionResponsiveImage);
  }

  const availableFormats = Object.entries(enabledFormats)
    .filter(([, value]) => value === true)
    .map(([format]) => format) as SupportedImageFormats[];

  responsiveImage.sources = (
    await Promise.all(
      availableFormats.map(async (format) => {
        // Original image should processed like all others,
        //  in case some optimizations are applied by the converter
        // TODO: it's not clear why `converter` ignores previous type-narrowing code
        //  when put inside a .map() which removes null and string types,
        //  forcing us to cast it

        const convertedSources = await Promise.all(
          responsiveImage.sources.map(async (source) => {
            const convertedBreakpoints = await Promise.all(
              source.breakpoints.map(async ({ path: sourcePath, uri }) => {
                return await (converter as ConversionAdapter).call(
                  this,
                  sourcePath,
                  changeExtension(sourcePath, format),
                  changeExtension(uri, format),
                  format,
                );
              }),
            );

            const convertedSource: ConversionSource = {
              // Retain transformation metadata
              ...source,
              breakpoints: convertedBreakpoints,
              format,
            };

            return convertedSource;
          }),
        );

        const fallbackSource = await generateFallbackSource.call(
          this,
          converter as ConversionAdapter,
          responsiveImage.originalPath,
          responsiveImage.options.sizes.__default,
          format,
        );

        return [...convertedSources, fallbackSource];
      }),
    )
  ).reduce((previous, current) => [...previous, ...current], []);

  return responsiveImage as ConversionResponsiveImage;
}

import { defaults, isNull, isUndefined, mapValues, max } from 'lodash';
import { lookup } from 'mime-types';
import { resolve } from 'path';
import { Dictionary } from 'ts-essentials';
import {
  BaseResponsiveImage,
  Breakpoint,
  pluginContext,
  resolveViewportAliases,
  SizesMap,
} from './base';
import { ResponsiveImageLoaderContext } from './config';
import { byMostEfficientFormat, ConversionResponsiveImage } from './conversion';
import { byIncreasingWidth } from './resizing';
import {
  byIncreasingMaxViewport,
  decodeTransformation,
  isTransformationSource,
  TransformationResponsiveImage,
  TransformationInlineOptions,
} from './transformation';

export type ResponsiveImage =
  | BaseResponsiveImage
  | TransformationResponsiveImage;

interface TagDescriptor {
  tag: string;
  type: 'background-image' | 'img-tag';
}

export function generateImgTagPlaceholder(path: string): string {
  return `[[responsive:${path}]]`;
}

export function generateUrlPlaceholder(url: string): string {
  return `[[responsive-url:${url}]]`;
}

function escapeSquareBrackets(text: string) {
  return text.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export const IMG_TAG_PLACEHOLDER_PATTERN = new RegExp(
  escapeSquareBrackets(generateImgTagPlaceholder('.+')),
  'g',
);

export const URL_PLACEHOLDER_PATTERN = new RegExp(
  escapeSquareBrackets(generateUrlPlaceholder('.+')),
  'g',
);

const IMAGES_PATTERN = /<img.*?\/>/gs;
const BACKGROUND_IMAGES_PATTERN =
  /<[a-z]\w*(?=[^<>]*\sresponsive-bg="\S+").*?>/gis;
const IMAGES_ATTRIBUTES_PATTERN =
  /^<img(?=.*\sresponsive(?:="(\S+)")?\s.*)(?=.*\ssrc="(\S+)"\s.*).*\/>$/s;
const BACKGROUND_IMAGES_ATTRIBUTE_PATTERN =
  /^<[a-z][\s\S]*(?=.*\sresponsive(?:="(\S+)")?\s.*)(?=.*\sresponsive-bg="(\S+)").*>$/is;
const OPTION_PATTERN = /^([^\s{]+)(?:{([\w|]+)})?$/;
// For all subsequent patterns, only the first match is taken into account
const CLASS_PATTERN = /class="([^"]+)"/;
const IMG_CLASS_PATTERN = /responsive-img-class(?:="([^"]+)")?/;
const PICTURE_CLASS_PATTERN = /responsive-picture-class(?:="([^"]+)")?/;
const ART_DIRECTION_ATTRIBUTE_PATTERN = /responsive-ad(?:="(\S+)")?/;
const ART_DIRECTION_IGNORE_ATTRIBUTE_PATTERN =
  /responsive-ad-ignore(?:="(\S+)")?/;

const imagesMatchesMap: { [index: string]: string } = {};

// TODO: should we automatically resolve '~' => 'src/', to solve Quasar special case?
function resolvePathAliases(imagePath: string): string | undefined {
  for (const { name, alias } of pluginContext.resolveAliases) {
    if (imagePath.startsWith(name)) {
      return imagePath.replace(name, alias);
    }
  }

  return undefined;
}

export function parseProperties(
  content: string,
): Dictionary<Dictionary<string>> {
  const propertiesMap: Dictionary<Dictionary<string>> = {};

  for (const property of content.split(';')) {
    const [name, options] = property.split('=');
    const parsedOptions = options.split(',');

    const viewportsMap: Dictionary<string> = {};

    for (const option of parsedOptions) {
      const optionResult = OPTION_PATTERN.exec(option);

      if (isNull(optionResult)) {
        throw new Error(`Option ${option} is malformed`);
      }

      const [, value, viewports] = optionResult;

      // If no viewports are specified, the value is marked to override the global default
      // TODO: mention that specifying "__default" is the same as omitting it
      if (isUndefined(viewports)) {
        viewportsMap.__default = value;
      } else {
        const parsedViewports = viewports.split('|');

        for (const viewport of parsedViewports) {
          viewportsMap[viewport] = value;
        }
      }
    }

    propertiesMap[name] = viewportsMap;
  }

  return propertiesMap;
}

function parseSizeProperty(
  responsiveOptions: string,
  defaultSize: number,
  viewportAliases: Dictionary<string>,
): SizesMap {
  const sizes = !isUndefined(responsiveOptions)
    ? mapValues(parseProperties(responsiveOptions).size, Number)
    : {};

  // If no default size has been set via inline options, we add the global default size
  // We need to resolve aliases because sizes will be picked in multiple modules
  //   based on their resolved aliases name
  const sizesWithoutAliases = defaults(
    resolveViewportAliases(sizes, viewportAliases),
    {
      __default: defaultSize,
    },
  );

  return mapValues(
    sizesWithoutAliases as SizesMap,
    (size) =>
      // Caps size to a given lower bound
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      max([size, 0.1])!,
  );
}

// TODO: manage webpack aliases automatically
export function resolveImagePath(
  loaderContext: ResponsiveImageLoaderContext,
  imagePath: string,
): string {
  // If no alias is found, we resolve it like a path relative to
  //  the processed file location
  return (
    resolvePathAliases(imagePath) ?? resolve(loaderContext.context, imagePath)
  );
}

function parseImagesTags(source: string): TagDescriptor[] {
  return (source.match(IMAGES_PATTERN) ?? []).map((tag) => ({
    tag,
    type: 'img-tag' as const,
  }));
}

function parseBackgroundImagesTags(source: string): TagDescriptor[] {
  return (source.match(BACKGROUND_IMAGES_PATTERN) ?? []).map((tag) => ({
    tag,
    type: 'background-image' as const,
  }));
}

function parseTags(source: string): TagDescriptor[] {
  return [...parseImagesTags(source), ...parseBackgroundImagesTags(source)];
}

function parseTagAttributes({
  tag,
  type,
}: TagDescriptor): RegExpExecArray | null {
  return type === 'img-tag'
    ? IMAGES_ATTRIBUTES_PATTERN.exec(tag)
    : BACKGROUND_IMAGES_ATTRIBUTE_PATTERN.exec(tag);
}

function parseArtDirectionAttributes(
  tag: string,
  imagePath: string,
): TransformationInlineOptions | undefined {
  const artDirectionMatches = ART_DIRECTION_ATTRIBUTE_PATTERN.exec(tag);
  if (!isNull(artDirectionMatches)) {
    const [, encodedTransformations] = artDirectionMatches;

    const artDirectionIgnoreMatches =
      ART_DIRECTION_IGNORE_ATTRIBUTE_PATTERN.exec(tag);

    return {
      // Even if typings doesn't reflect so, capturing groups with no match returns undefined
      inlineTransformations: !isUndefined(encodedTransformations)
        ? decodeTransformation(
            imagePath,
            parseProperties(encodedTransformations),
          )
        : {},
      transformationsToIgnore: isNull(artDirectionIgnoreMatches)
        ? false
        : isUndefined(artDirectionIgnoreMatches[1])
        ? true
        : artDirectionIgnoreMatches[1].split('|'),
    };
  }

  return undefined;
}

function generateReplacingTag(
  resolvedPath: string,
  tag: string,
  type: string,
): string {
  return type === 'img-tag'
    ? generateImgTagPlaceholder(resolvedPath)
    : // "background-image" doesn't remove the original tag,
      //  instead it adds a data-* marker and appends the placeholder after it.
      // This will trigger the generation of the element managing the image selection
      `${tag.slice(0, -1)} data-responsive-bg>\n${generateImgTagPlaceholder(
        resolvedPath,
      )}\n`;
}

export function parse(
  loaderContext: ResponsiveImageLoaderContext,
  source: string,
): {
  sourceWithPlaceholders: string;
  parsedImages: ResponsiveImage[];
} {
  const { defaultSize, viewportAliases } = pluginContext.options;

  const responsiveImages: ResponsiveImage[] = [];

  const tagsDescriptors = parseTags(source);

  for (const tagDescriptor of tagsDescriptors) {
    const attributesMatches = parseTagAttributes(tagDescriptor);

    if (isNull(attributesMatches)) {
      // The tag doesn't have valid "responsive" or "src" attributes (for img tags)
      // OR
      // The tag doesn't have valid "responsive" or "responsive-bg" attributes (for background image tags)
      continue;
    }

    const { tag, type } = tagDescriptor;
    const [, responsiveOptions, imagePath] = attributesMatches;

    const resolvedPath = resolveImagePath(loaderContext, imagePath);

    imagesMatchesMap[resolvedPath] =
      type === 'img-tag'
        ? tag
        : // The image selection helper element is hidden with an inline style
          // We must call the function providing `event` parameter when inline
          // We check for `responsiveBgImageHandler` to be available into global scope executing it
          // This is done to avoid errors when the polyfill script is deferred and/or executed after the first onload event
          // (this scenario could happen when using pre-rendering)
          // See https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Event_handlers#Event_handlers_parameters_this_binding_and_the_return_value
          `<img src="${imagePath}" style="display:none" class="responsive-bg-holder" onload="typeof responsiveBgImageHandler !== 'undefined' && responsiveBgImageHandler(event)"/>`;

    const responsiveImage: ResponsiveImage = {
      originalPath: resolvedPath,
      sources: [],
      options: {
        sizes: parseSizeProperty(
          responsiveOptions,
          defaultSize,
          viewportAliases,
        ),
      },
    };

    const artDirectionInlineOptions = parseArtDirectionAttributes(
      tag,
      imagePath,
    );

    if (!isUndefined(artDirectionInlineOptions)) {
      (
        responsiveImage as TransformationResponsiveImage
      ).options.inlineArtDirection = artDirectionInlineOptions;
    }

    responsiveImages.push(responsiveImage);

    source = source.replace(tag, generateReplacingTag(resolvedPath, tag, type));
  }

  return { sourceWithPlaceholders: source, parsedImages: responsiveImages };
}

function generateSrcSet(breakpoints: Breakpoint[]): string {
  if (breakpoints.length === 1) {
    return generateUrlPlaceholder(breakpoints[0].uri);
  }

  return breakpoints
    .sort(byIncreasingWidth)
    .map(({ uri, width }) => `${generateUrlPlaceholder(uri)} ${width}w`)
    .join(', ');
}

export function enhance(
  source: string,
  images: ConversionResponsiveImage[],
): string {
  // TODO: prevent <picture> generation when art direction and conversion are disabled,
  //  using only srcset

  for (const image of images) {
    const imageMatch = imagesMatchesMap[image.originalPath];

    let enhancedImage;

    if (image.sources.length === 0) {
      // We just leave the original img tag if no sources has been generated
      enhancedImage = imageMatch;
    } else {
      const originalClass = CLASS_PATTERN.exec(imageMatch)?.[1] ?? '';

      const responsiveImgClassMatches = IMG_CLASS_PATTERN.exec(imageMatch);
      const responsiveImgClass = isNull(responsiveImgClassMatches)
        ? originalClass
        : responsiveImgClassMatches[1] ?? '';

      const responsivePictureClassMatches =
        PICTURE_CLASS_PATTERN.exec(imageMatch);
      const responsivePictureClass = isNull(responsivePictureClassMatches)
        ? originalClass
        : responsivePictureClassMatches[1] ?? '';

      const sortedSources = image.sources
        .sort(byIncreasingMaxViewport)
        .sort(byMostEfficientFormat);

      // When we have no conversions and no art-direction we could avoid using 'picture'
      // We use it anyway to always leave the original tag image "as-is" as fallback
      enhancedImage = `<picture class="${responsivePictureClass}">\n`;
      for (const source of sortedSources) {
        const { breakpoints, format } = source;

        const mimeType = lookup(format);

        if (!mimeType) {
          throw new Error(
            'Provided format could not be resolved to a mime type',
          );
        }

        enhancedImage += '<source ';
        enhancedImage += `type="${mimeType}" `;

        // 'media' attribute must be set before 'srcset' for testing purposes
        if (isTransformationSource(source)) {
          enhancedImage += `sizes="${
            source.size > 1.0 ? `${source.size}px` : `${source.size * 100}vm`
          }" `;
          enhancedImage += `media="(max-width: ${source.maxViewport}px)" `;
        }

        enhancedImage += `srcset="${generateSrcSet(breakpoints)}" `;
        enhancedImage += '/>\n';
      }

      // Img tag is on bottom to preserve increasing image size sort-order
      // Img tag is copied as-is to preserve original attributes
      enhancedImage +=
        imageMatch.replace(CLASS_PATTERN, `class="${responsiveImgClass}"`) +
        '\n';
      enhancedImage += '</picture>\n';
    }

    source = source.replace(
      generateImgTagPlaceholder(image.originalPath),
      enhancedImage,
    );
  }

  return source;
}

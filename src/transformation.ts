import {
  defaults,
  drop,
  each,
  has,
  isNull,
  isUndefined,
  map,
  mapValues,
  merge,
  omit,
  union,
} from 'lodash';
import { format, parse } from 'path';
import { Dictionary } from 'ts-essentials';
import {
  BaseResponsiveImage,
  BaseSource,
  generateUri,
  getTempImagesDir,
  resolveViewportAliases,
} from './base';
import { ResponsiveImageLoaderContext } from './config';
import { deepFreeze, selectFromPreset } from './helpers';
import { resolveImagePath, ResponsiveImage } from './parsing';
import ResponsiveImagePlugin from './responsive-image-plugin';
import { thumborDockerTransformer } from './transformers/thumbor/thumbor';
import {
  TransformationAdapter,
  TransformationAdapterPresets,
} from './transformers/transformers';

interface BaseTransformationDescriptor {
  maxViewport: number;
  size: number;
  isCustom: boolean;
}

interface ProcessableTransformationDescriptor
  extends BaseTransformationDescriptor {
  ratio: string;
}

interface CustomTransformationDescriptor extends BaseTransformationDescriptor {
  path: string;
}

export type TransformationDescriptor =
  | ProcessableTransformationDescriptor
  | CustomTransformationDescriptor;

export function isCustomTransformation(
  transformation: TransformationDescriptor,
): transformation is CustomTransformationDescriptor {
  return transformation.isCustom;
}

type Transformation = { path: string } | { ratio: string };

export function hasPathProperty(transformation: Transformation): boolean {
  return has(transformation, 'path');
}

interface TransformationMap {
  [index: string]: Transformation;
}

interface TransformationWithSizeMap {
  [index: string]: Transformation & { size: number };
}

export interface TransformationInlineOptions {
  inlineTransformations: TransformationMap;
  transformationsToIgnore: boolean | string[];
}

export type TransformationSource = BaseSource & TransformationDescriptor;

export type TransformationResponsiveImage = BaseResponsiveImage & {
  options: {
    inlineArtDirection: TransformationInlineOptions;
  };
  sources: (BaseSource | TransformationSource)[];
};

export function isTransformationResponsiveImage(
  responsiveImage: ResponsiveImage,
): responsiveImage is TransformationResponsiveImage {
  return !!(responsiveImage as TransformationResponsiveImage).options
    ?.inlineArtDirection;
}

export function isTransformationSource(
  source: BaseSource | TransformationSource,
): source is TransformationSource {
  return !!(source as TransformationSource).maxViewport;
}

export function byIncreasingMaxViewport(
  a: BaseSource | TransformationSource,
  b: BaseSource | TransformationSource,
): number {
  if (isTransformationSource(a) && isTransformationSource(b)) {
    return a.maxViewport - b.maxViewport;
  }

  if (!isTransformationSource(a) && !isTransformationSource(b)) {
    return 0;
  }

  // Sources without maxViewport are last
  return !isTransformationSource(a) ? 1 : -1;
}

export function decodeTransformation(
  imagePath: string,
  // Must have a default value because there will always be only one of them
  {
    path: pathOptions = {},
    ratio: ratioOptions = {},
  }: Dictionary<Dictionary<string>>,
): TransformationMap {
  const viewports = union(Object.keys(pathOptions), Object.keys(ratioOptions));

  const transformations: TransformationMap = {};

  for (const viewport of viewports) {
    // Custom transformation take precedence on other options
    if (!isUndefined(pathOptions[viewport])) {
      transformations[viewport] = {
        path: pathOptions[viewport],
      };
    } else if (!isUndefined(ratioOptions[viewport])) {
      transformations[viewport] = {
        ratio: ratioOptions[viewport],
      };
    } else {
      throw new Error(
        `Inline transformation ${viewport} for image ${imagePath} has no valid options`,
      );
    }
  }

  return transformations;
}

export interface TransformationConfig {
  transformer: TransformationAdapterPresets | TransformationAdapter | null;
  // TODO: remove global defaultRatio
  defaultRatio: string;
  defaultTransformations: TransformationMap;
}

const MAX_VIEWPORT_PATTERN = /^(\d+)$/;

function validateTransformationName(name: string): void {
  if (!MAX_VIEWPORT_PATTERN.test(name)) {
    throw new Error(
      `${name} is not a valid transformation name. Have you used an alias without defining it?`,
    );
  }
}

function generateDescriptors(
  transformations: TransformationWithSizeMap,
): TransformationDescriptor[] {
  return map(transformations, (transformation, name) => {
    // We only need capturing groups, full match element is dropped
    const [maxViewport] = map(drop(MAX_VIEWPORT_PATTERN.exec(name), 1), Number);

    return {
      ...transformation,
      isCustom: hasPathProperty(transformation),
      maxViewport,
    };
  });
}

export function normalizeTransformations(
  pluginContext: ResponsiveImagePlugin,
  {
    inlineTransformations,
    transformationsToIgnore,
  }: TransformationInlineOptions,
  sizes: Dictionary<number>,
): TransformationDescriptor[] {
  const {
    artDirection: { defaultRatio, defaultTransformations },
    viewportAliases,
  } = pluginContext.options;

  const filteredDefaultTransformations =
    transformationsToIgnore === false
      ? defaultTransformations // Keep all default transformation
      : transformationsToIgnore === true
      ? {} // Remove all default transformation
      : omit(defaultTransformations, transformationsToIgnore); // Remove specified transformations

  const transformations = merge(
    {},
    resolveViewportAliases(filteredDefaultTransformations, viewportAliases),
    resolveViewportAliases(inlineTransformations, viewportAliases),
  );

  const transformationNames = Object.keys(transformations);

  if (transformationNames.length === 0) {
    return [];
  }

  // TODO: take into account ratio default override
  each(transformationNames, validateTransformationName);
  const transformationsWithSize = mapValues(
    transformations,
    (transformation, name) => {
      defaults(
        transformation,
        !hasPathProperty(transformation) ? { ratio: defaultRatio } : {},
      );

      return {
        ...transformation,
        size: sizes[name] ?? sizes.__default,
      };
    },
  );

  return generateDescriptors(transformationsWithSize);
}

export const generateTransformationUri = (
  pluginContext: ResponsiveImagePlugin,
  path: string,
  transformation: TransformationDescriptor,
): ReturnType<typeof generateUri> =>
  generateUri(pluginContext, path, () => {
    const { maxViewport, size } = transformation;
    // 'tb' stands for 'transformation breakpoint'
    let pathBody = `-tb_${maxViewport}`;

    // TODO: path isn't apparently working
    if (isCustomTransformation(transformation)) {
      // 'p' stands for 'path'
      // 's' stands for 'size'
      pathBody += `-p-s_${size * 100}`;
    } else {
      const { ratio } = transformation;
      // 'r' stands for 'ratio'
      // 's' stands for 'size'
      pathBody += `-r_${ratio.replace(':', '_')}-s_${size * 100}`;
    }

    return pathBody;
  });

type TransformationAdapterPresetsMap = {
  [index in TransformationAdapterPresets]: TransformationAdapter;
};

const presetTransformers: TransformationAdapterPresetsMap = deepFreeze({
  thumbor: thumborDockerTransformer,
});

export const pendingTransformations: [
  sourceImagePath: string,
  transformationSource: TransformationSource,
  uri: string,
][] = [];

// Used by the loader
export function applyTransformations(
  pluginContext: ResponsiveImagePlugin,
  loaderContext: ResponsiveImageLoaderContext,
  image: ResponsiveImage,
): void {
  const { transformer } = pluginContext.options.artDirection;

  // Manage transformations only on images explicitly opting-in
  if (isNull(transformer) || !isTransformationResponsiveImage(image)) {
    return;
  }

  const transformations = normalizeTransformations(
    pluginContext,
    image.options.inlineArtDirection,
    image.options.sizes,
  );

  // Normalizes paths of custom transformations
  each(transformations, (transformation) => {
    if (isCustomTransformation(transformation)) {
      transformation.path = resolveImagePath(
        pluginContext,
        loaderContext,
        transformation.path,
      );
    }
  });

  const transformationSources = transformations.map((transformation) => {
    const uri = generateTransformationUri(
      pluginContext,
      image.originalPath,
      transformation,
    );

    const { base } = parse(uri);
    const path = format({
      dir: getTempImagesDir(),
      base,
    });

    const transformationSource = {
      ...transformation,
      path,
      breakpoints: [
        {
          path,
          uri,
          width: transformation.maxViewport * transformation.size,
        },
      ],
    } as TransformationSource;

    // Store transformations for the pluging to execute them later on
    pendingTransformations.push([
      isCustomTransformation(transformation)
        ? transformation.path
        : image.originalPath,
      transformationSource,
      uri,
    ]);

    return transformationSource;
  });

  image.sources.push(...transformationSources);
}

export function resolveTransformer(
  pluginContext: ResponsiveImagePlugin,
  transformer: TransformationConfig['transformer'],
) {
  if (typeof transformer === 'string') {
    transformer = selectFromPreset(
      pluginContext,
      presetTransformers,
      transformer,
    );
  }

  return transformer;
}

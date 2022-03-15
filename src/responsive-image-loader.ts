import { each, merge } from 'lodash';
import { LoaderDefinitionFunction } from 'webpack';
import { OPTIONS_SCHEMA, ResponsiveImageLoaderConfig } from './config';
import { ConversionResponsiveImage, convertImage } from './conversion';
import { DEFAULT_OPTIONS } from './defaults';
import { enhance, parse, resolveImagePath } from './parsing';
import { resizeImage } from './resizing';
import {
  isCustomTransformation,
  isTransformationResponsiveImage,
  normalizeTransformations,
  transformImage,
} from './transformation';
import { setPathsOptions, guardAgainstDefaultAlias } from './base';
import { DeepPartial } from 'ts-essentials';

const loader: LoaderDefinitionFunction<
  DeepPartial<ResponsiveImageLoaderConfig>
> = function (source) {
  const callback = this.async();

  const userOptions = this.getOptions(OPTIONS_SCHEMA);

  const {
    paths: pathOptions,
    defaultSize,
    viewportAliases,
    artDirection: artDirectionOptions,
    resolutionSwitching: resolutionSwitchingOptions,
    conversion: conversionOptions,
  } = merge({}, DEFAULT_OPTIONS, userOptions);

  setPathsOptions(pathOptions);
  guardAgainstDefaultAlias(viewportAliases);

  const { sourceWithPlaceholders, parsedImages } = parse(
    this.context,
    this.rootContext,
    source,
    defaultSize,
    viewportAliases,
  );

  if (parsedImages.length === 0) {
    callback(null, source);
    return;
  }

  this.addDependency(this.resourcePath);

  parsedImages.map((responsiveImage) =>
    this.addDependency(responsiveImage.originalPath),
  );

  let imagesToProcess = Promise.all(
    parsedImages.map(async (responsiveImage) => {
      // Manage transformations only on images explicitly opting-in
      if (!isTransformationResponsiveImage(responsiveImage)) {
        return responsiveImage;
      }

      const transformations = normalizeTransformations(
        responsiveImage.options.inlineArtDirection,
        artDirectionOptions,
        responsiveImage.options.sizes,
        viewportAliases,
      );

      // Normalizes paths of custom transformations
      each(transformations, (transformation) => {
        if (isCustomTransformation(transformation)) {
          transformation.path = resolveImagePath(
            this.rootContext,
            this.context,
            transformation.path,
          );
        }
      });

      const transformationSources = await transformImage.call(
        this,
        responsiveImage.originalPath,
        transformations,
        artDirectionOptions.transformer,
      );

      responsiveImage.sources.push(...transformationSources);

      return responsiveImage;
    }),
  );

  imagesToProcess = imagesToProcess.then((imagesToResize) =>
    Promise.all(
      imagesToResize.map(
        async (responsiveImage) =>
          await resizeImage.call(
            this,
            responsiveImage,
            resolutionSwitchingOptions,
          ),
      ),
    ),
  );

  imagesToProcess = imagesToProcess.then((imagesToConvert) =>
    Promise.all(
      imagesToConvert.map(async (responsiveImage) => {
        return await convertImage.call(
          this,
          responsiveImage,
          conversionOptions,
        );
      }),
    ),
  );

  (imagesToProcess as Promise<ConversionResponsiveImage[]>)
    .then((responsiveImages) =>
      callback(null, enhance(sourceWithPlaceholders, responsiveImages)),
    )
    .catch(callback);
};

export default loader;

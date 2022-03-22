import { DeepPartial } from 'ts-essentials';
import { LoaderDefinitionFunction } from 'webpack';
import { ResponsiveImagePluginConfig } from './config';
import { ConversionResponsiveImage, applyConversions } from './conversion';
import { enhance, parse } from './parsing';
import { applyResizes } from './resizing';
import { applyTransformations } from './transformation';

const loader: LoaderDefinitionFunction<
  DeepPartial<ResponsiveImagePluginConfig>
> = function (source) {
  const { sourceWithPlaceholders, parsedImages } = parse(
    this.context,
    this.rootContext,
    source,
  );

  if (parsedImages.length === 0) {
    return source;
  }

  this.addDependency(this.resourcePath);

  parsedImages.map((responsiveImage) =>
    this.addDependency(responsiveImage.originalPath),
  );

  parsedImages.forEach((image) =>
    applyTransformations(this.rootContext, this.context, image),
  );
  parsedImages.forEach(applyResizes);
  parsedImages.map(applyConversions);

  return enhance(
    sourceWithPlaceholders,
    parsedImages as ConversionResponsiveImage[],
  );
};

export default loader;

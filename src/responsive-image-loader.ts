import { DeepPartial } from 'ts-essentials';
import { LoaderDefinitionFunction } from 'webpack';
import { ResponsiveImagePluginConfig } from './config';
import { applyConversions, ConversionResponsiveImage } from './conversion';
import { enhance, parse } from './parsing';
import { applyResizes } from './resizing';
import ResponsiveImagePlugin from './responsive-image-plugin';
import { applyTransformations } from './transformation';

interface ResponsiveImageCompilationEnhancement {
  _compilation: {
    pluginContext: ResponsiveImagePlugin;
  };
}

const loader: LoaderDefinitionFunction<
  DeepPartial<ResponsiveImagePluginConfig>,
  ResponsiveImageCompilationEnhancement
> = function (source) {
  const { pluginContext } = this._compilation;

  const { sourceWithPlaceholders, parsedImages } = parse(
    pluginContext,
    this,
    source,
  );

  if (parsedImages.length === 0) {
    return source;
  }

  this.addDependency(this.resourcePath);

  parsedImages.forEach((responsiveImage) =>
    this.addDependency(responsiveImage.originalPath),
  );

  parsedImages.forEach((image) =>
    applyTransformations(pluginContext, this, image),
  );
  parsedImages.forEach((image) => applyResizes(pluginContext, image));
  parsedImages.forEach((image) => applyConversions(pluginContext, image));

  return enhance(
    pluginContext,
    sourceWithPlaceholders,
    parsedImages as ConversionResponsiveImage[],
  );
};

export default loader;

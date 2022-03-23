import { writeFile } from 'fs-extra';
import { isNull, merge } from 'lodash';
import { validate } from 'schema-utils';
import { DeepPartial } from 'ts-essentials';
import { Compilation, Compiler, sources } from 'webpack';
import { AliasOption, guardAgainstDefaultAlias, pluginContext } from './base';
import { OPTIONS_SCHEMA, ResponsiveImagePluginConfig } from './config';
import {
  guardAgainstUnsupportedSourceType,
  pendingConversions,
  resolveConverter,
} from './conversion';
import { ConversionAdapter } from './converters/converters';
import { DEFAULT_OPTIONS } from './defaults';
import { addHashToUri } from './helpers';
// import { generateUrlPlaceholder, URL_PLACEHOLDER_PATTERN } from './parsing';
import { ResizingAdapter } from './resizers/resizers';
import { pendingResizes, resolveResizer } from './resizing';
import { pendingTransformations, resolveTransformer } from './transformation';
import { TransformationAdapter } from './transformers/transformers';
import { WebpackLogger } from './webpack-logger';

const { RawSource } = sources;

class ResponsiveImagePlugin {
  private pluginName = ResponsiveImagePlugin.name;
  private options: ResponsiveImagePluginConfig;
  private urlReplaceMap: Record<string, string> = {};

  private logger!: WebpackLogger;

  private transformer: TransformationAdapter | null;
  private resizer: ResizingAdapter | null;
  private converter: ConversionAdapter | null;

  constructor(options: DeepPartial<ResponsiveImagePluginConfig> = {}) {
    validate(OPTIONS_SCHEMA, options, {
      name: this.pluginName,
    });

    this.options = merge({}, DEFAULT_OPTIONS, options);
    guardAgainstDefaultAlias(this.options.viewportAliases);

    this.transformer = this.options.artDirection.transformer =
      resolveTransformer(this.options.artDirection.transformer);

    this.resizer = this.options.resolutionSwitching.resizer = resolveResizer(
      this.options.resolutionSwitching.resizer,
    );

    this.converter = this.options.conversion.converter = resolveConverter(
      this.options.conversion.converter,
    );

    pluginContext.options = this.options;
  }

  // private replaceUrls(modules: Iterable<Module>) {
  //   let gg = 0;
  //   for (const module of modules) {
  //     // console.log(module);
  //     // module.originalSource()
  //     // module.source()

  //     /*
  //             eslint-disable-next-line
  //             @typescript-eslint/no-unsafe-member-access,
  //             @typescript-eslint/no-explicit-any
  //           */
  //     if (!(module as any)._source) {
  //       continue;
  //     }

  //     /*
  //             eslint-disable-next-line
  //             @typescript-eslint/no-unsafe-assignment,
  //             @typescript-eslint/no-unsafe-member-access,
  //             @typescript-eslint/no-explicit-any
  //           */
  //     let source: string = (module as any)._source._value;

  //     if (!URL_PLACEHOLDER_PATTERN.exec(source)) {
  //       continue;
  //     }

  //     if (gg === 0) {
  //       console.log(source);
  //     }

  //     // TODO: do this with a single replace step
  //     // See https://stackoverflow.com/a/15604206
  //     for (const [originalUrl, urlWithHash] of Object.entries(
  //       this.urlReplaceMap,
  //     )) {
  //       source = source.replace(
  //         generateUrlPlaceholder(originalUrl),
  //         urlWithHash,
  //       );
  //     }

  //     /*
  //             eslint-disable-next-line
  //             @typescript-eslint/no-unsafe-member-access,
  //             @typescript-eslint/no-explicit-any
  //           */
  //     (module as any)._source._value = source;
  //   }
  // }

  // Art direction: apply ratio transformations
  private async transformImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Art Direction');

    if (isNull(this.transformer)) {
      logger.info('Null transformer provided, skipping...');
      return;
    }

    logger.info('Initializing step...');

    await this.transformer.setup?.();

    await Promise.all(
      pendingTransformations.map(
        async ([sourceImagePath, transformationSource, uri]) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const transformedImage = await this.transformer!(
              sourceImagePath,
              transformationSource,
            );
            logger.log(`Generated: ${uri}`);

            const uriWithHash = addHashToUri(uri, transformedImage);

            this.urlReplaceMap[uri] = uriWithHash;

            // TODO: does this add the files/assets to the cache?
            compilation.emitAsset(uriWithHash, new RawSource(transformedImage));
            await writeFile(transformationSource.path, transformedImage);
          } catch (e) {
            pluginContext.logger.error(e);
          }
        },
      ),
    );

    await this.transformer.teardown?.();

    logger.info('Step completed!');
    logger.info();
  }

  // Resolution switching: get resized image versions for multiple viewports
  async resizeImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Resolution Switching');

    if (isNull(this.resizer)) {
      logger.info('Null resizer provided, skipping...');
      return;
    }

    logger.info('Initializing step...');

    await this.resizer.setup?.();

    await Promise.all(
      pendingResizes.map(async ([sourceImagePath, breakpoint, uri]) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const resizedImage = await this.resizer!(sourceImagePath, breakpoint);
          logger.log(`Generated: ${uri}`);

          const uriWithHash = addHashToUri(uri, resizedImage);

          this.urlReplaceMap[uri] = uriWithHash;

          // TODO: does this add the files/assets to the cache?
          compilation.emitAsset(uriWithHash, new RawSource(resizedImage));
          await writeFile(breakpoint.path, resizedImage);
        } catch (e) {
          pluginContext.logger.error(e);
        }
      }),
    );

    await this.resizer.teardown?.();

    logger.info('Step completed!');
    logger.info();
  }

  // Conversion: convert images to more compression efficient formats and fallback formats
  async convertImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Conversion');

    if (isNull(this.converter)) {
      logger.info('Null converter provided, skipping...');
      return;
    }

    logger.info('Initializing step...');

    await this.converter.setup?.();

    await Promise.all(
      pendingConversions.map(async ([sourceImagePath, format, uri]) => {
        try {
          await guardAgainstUnsupportedSourceType(sourceImagePath);

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const convertedImage = await this.converter!(sourceImagePath, format);
          logger.log(`Generated: ${uri}`);

          const uriWithHash = addHashToUri(uri, convertedImage);

          this.urlReplaceMap[uri] = uriWithHash;

          // TODO: does this add the files/assets to the cache?
          compilation.emitAsset(uriWithHash, new RawSource(convertedImage));
        } catch (e) {
          pluginContext.logger.error(e);
        }
      }),
    );

    await this.converter.teardown?.();

    logger.info('Step completed!');
    logger.info();
  }

  apply(compiler: Compiler) {
    pluginContext.logger = this.logger = compiler.getInfrastructureLogger(
      this.pluginName,
    );

    compiler.resolverFactory.hooks.resolver
      .for('normal')
      .tap(this.pluginName, (resolver) => {
        pluginContext.resolveAliases = resolver.options.alias.filter(
          ({ onlyModule, alias }) => !onlyModule && typeof alias === 'string',
        ) as AliasOption[];
      });

    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // compilation.hooks.optimizeModules.tap(this.pluginName, (modules) => {
      //   this.replaceUrls(modules);
      // });
      compilation.hooks.finishModules.tapPromise(this.pluginName, async () => {
        await this.transformImages(compilation);
        await this.resizeImages(compilation);
        await this.convertImages(compilation);
        // this.replaceUrls(modules);
      });
    });
  }
}

export default ResponsiveImagePlugin;

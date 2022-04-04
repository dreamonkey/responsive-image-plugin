import { writeFile } from 'fs-extra';
import { isNull, merge } from 'lodash';
import { validate } from 'schema-utils';
import { DeepPartial } from 'ts-essentials';
import { Compilation, Compiler, Module, sources } from 'webpack';
import { AliasOption, guardAgainstDefaultAlias } from './base';
import { OPTIONS_SCHEMA, ResponsiveImagePluginConfig } from './config';
import {
  guardAgainstUnsupportedSourceType,
  pendingConversions,
  resolveConverter,
} from './conversion';
import { ConversionAdapter } from './converters/converters';
import { DEFAULT_OPTIONS } from './defaults';
import { addHashToUri } from './helpers';
import { URL_PLACEHOLDER_PATTERN } from './parsing';
import { ResizingAdapter } from './resizers/resizers';
import { pendingResizes, resolveResizer } from './resizing';
import { pendingTransformations, resolveTransformer } from './transformation';
import { TransformationAdapter } from './transformers/transformers';
import { WebpackLogger } from './webpack-logger';
import { join } from 'path';

const { RawSource } = sources;

// From https://github.com/cyrilfretlink/try-purescript-react-basic/blob/e7bc08f83e72b6dee99ec18fab332223492d6aca/purs-css-modules-webpack-plugin/src/index.js#L43-L65
const rebuildModule = (compilation: Compilation, module: Module) =>
  new Promise<void>((resolve, reject) => {
    compilation.rebuildModule(module, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

class ResponsiveImagePlugin {
  // Shared with the loader
  public options: ResponsiveImagePluginConfig;
  public resolveAliases: AliasOption[] = [];
  public logger!: WebpackLogger;
  public urlReplaceMap: Record<string, string> = {};

  private pluginName = ResponsiveImagePlugin.name;

  private transformer!: TransformationAdapter | null;
  private resizer!: ResizingAdapter | null;
  private converter!: ConversionAdapter | null;

  constructor(options: DeepPartial<ResponsiveImagePluginConfig> = {}) {
    validate(OPTIONS_SCHEMA, options, {
      name: this.pluginName,
    });

    this.options = merge({}, DEFAULT_OPTIONS, options);
    guardAgainstDefaultAlias(this.options.viewportAliases);
  }

  // Art direction: apply ratio transformations
  private async transformImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Art Direction');

    if (isNull(this.transformer)) {
      logger.info('Null transformer provided, skipping...');
      return;
    }

    if (pendingTransformations.length === 0) {
      logger.info('No transformations to process, skipping...');
      return;
    }

    logger.info('Initializing...');

    await this.transformer.setup?.(this);

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
            this.logger.error(e);
          }
        },
      ),
    );

    await this.transformer.teardown?.(this);

    logger.info('Completed!');
    logger.info('===============');
  }

  // Resolution switching: get resized image versions for multiple viewports
  async resizeImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Resolution Switching');

    if (isNull(this.resizer)) {
      logger.info('Null resizer provided, skipping...');
      return;
    }

    if (pendingResizes.length === 0) {
      logger.info('No resizes to process, skipping...');
      return;
    }

    logger.info('Initializing...');

    await this.resizer.setup?.(this);

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
          this.logger.error(e);
        }
      }),
    );

    await this.resizer.teardown?.(this);

    logger.info('Completed!');
    logger.info('===============');
  }

  // Conversion: convert images to more compression efficient formats and fallback formats
  async convertImages(compilation: Compilation) {
    const logger = this.logger.getChildLogger('Conversion');

    if (isNull(this.converter)) {
      logger.info('Null converter provided, skipping...');
      return;
    }

    if (pendingConversions.length === 0) {
      logger.info('No conversions to process, skipping...');
      return;
    }

    logger.info('Initializing...');

    await this.converter.setup?.(this);

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
          this.logger.error(e);
        }
      }),
    );

    await this.converter.teardown?.(this);

    logger.info('Completed!');
    logger.info('===============');
  }

  apply(compiler: Compiler) {
    this.logger = compiler.getInfrastructureLogger(this.pluginName);

    this.transformer = this.options.artDirection.transformer =
      resolveTransformer(this, this.options.artDirection.transformer);

    this.resizer = this.options.resolutionSwitching.resizer = resolveResizer(
      this,
      this.options.resolutionSwitching.resizer,
    );

    this.converter = this.options.conversion.converter = resolveConverter(
      this,
      this.options.conversion.converter,
    );

    compiler.resolverFactory.hooks.resolver
      .for('normal')
      .tap(this.pluginName, (resolver) => {
        this.resolveAliases = resolver.options.alias.filter(
          ({ onlyModule, alias }) => !onlyModule && typeof alias === 'string',
        ) as AliasOption[];
      });

    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (compilation as any).pluginContext = this;

      compilation.hooks.finishModules.tapPromise(
        this.pluginName,
        async (modules) => {
          await this.transformImages(compilation);
          await this.resizeImages(compilation);
          await this.convertImages(compilation);

          const modulesToRebuild: Module[] = [];

          for (const module of modules) {
            // TODO: Is this the correct way to check this?
            // Modules with type different than javascript may not have a source
            if (!module.getSourceTypes().has('javascript')) {
              continue;
            }

            // TODO: which would be the correct way of accessing this source?
            /* eslint-disable-next-line */
            const source: string = (module as any)._source._value;

            if (!URL_PLACEHOLDER_PATTERN.exec(source)) {
              continue;
            }

            modulesToRebuild.push(module);
          }

          await Promise.all(
            modulesToRebuild.map((module) =>
              rebuildModule(compilation, module),
            ),
          );
        },
      );
    });
  }
}

export default ResponsiveImagePlugin;

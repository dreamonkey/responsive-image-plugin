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
import { urlReplaceMap, URL_PLACEHOLDER_PATTERN } from './parsing';
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

let generationStatus: 'ready' | 'processing' | 'completed' = 'ready';
let releaseWhenGenerationCompletedTimeout: NodeJS.Timeout;
let generationCompleted: Promise<void>;

function getBgHandlerPath() {
  // Short circuit the path since it's not available at test time,
  // since we don't run an intermediate build step
  if (process.env.NODE_ENV === 'test') {
    return '';
  }

  return require.resolve(join(__dirname, 'bg-handler'));
}

class ResponsiveImagePlugin {
  public static loader = require.resolve(
    join(__dirname, 'responsive-image-loader'),
  );
  public static bgHandler = getBgHandlerPath();

  // Shared with the loader
  public options: ResponsiveImagePluginConfig;
  public resolveAliases: AliasOption[] = [];
  public logger!: WebpackLogger;

  private pluginName = ResponsiveImagePlugin.name;

  private adapters!: {
    transformer: TransformationAdapter | null;
    resizer: ResizingAdapter | null;
    converter: ConversionAdapter | null;
  };

  constructor(options: DeepPartial<ResponsiveImagePluginConfig> = {}) {
    validate(OPTIONS_SCHEMA, options, {
      name: this.pluginName,
    });

    this.options = merge({}, DEFAULT_OPTIONS, options);
    guardAgainstDefaultAlias(this.options.viewportAliases);
  }

  private async executeAdapter<
    A extends 'transformer' | 'resizer' | 'converter',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    O extends [any, any, string],
  >(
    title: string,
    adapterName: A,
    compilation: Compilation,
    operations: O[],
    callback?: (operation: O, image: Buffer) => Promise<void>,
  ) {
    const logger = this.logger.getChildLogger(title);
    const adapter = this.adapters[adapterName];

    if (isNull(adapter)) {
      logger.info(`Null ${adapterName} provided, skipping...`);
      return;
    }

    if (operations.length === 0) {
      logger.info('No operations to process, skipping...');
      return;
    }

    logger.info('Initializing...');

    await adapter.setup?.(this);

    await Promise.all(
      // TODO: hardcoded position, use objects instead
      operations.map(async (operation) => {
        const [firstParam, secondParam, uri] = operation;

        if (urlReplaceMap[uri]) {
          logger.log(
            `Already processed URI (${uri} -> ${urlReplaceMap[uri]}), skipping`,
          );
          return;
        }

        // Mark the URI to avoid processing it multiple times
        urlReplaceMap[uri] = 'generation-in-progress';

        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          const image = await adapter(firstParam, secondParam);
          logger.log(`Generated: ${uri}`);

          const uriWithHash = addHashToUri(uri, image);

          urlReplaceMap[uri] = uriWithHash;

          // TODO: does this add the files/assets to the cache? No :(
          compilation.emitAsset(uriWithHash, new RawSource(image));

          await callback?.(operation, image);
        } catch (e) {
          logger.error(e);
          urlReplaceMap[uri] = 'generation-failed';
        }
      }),
    );

    await adapter.teardown?.(this);

    logger.info('Completed!');
    logger.info('===============');
  }

  // Art direction: apply ratio transformations
  private async transformImages(compilation: Compilation) {
    await this.executeAdapter(
      'Art Direction',
      'transformer',
      compilation,
      pendingTransformations,
      async ([, transformationSource], transformedImage) => {
        await writeFile(transformationSource.path, transformedImage);
      },
    );
  }

  // Resolution switching: get resized image versions for multiple viewports
  async resizeImages(compilation: Compilation) {
    await this.executeAdapter(
      'Resolution Switching',
      'resizer',
      compilation,
      pendingResizes,
      async ([, breakpoint], resizedImage) => {
        await writeFile(breakpoint.path, resizedImage);
      },
    );
  }

  // Conversion: convert images to more compression efficient formats and fallback formats
  async convertImages(compilation: Compilation) {
    await Promise.all(
      pendingConversions.map(async ([sourceImagePath]) => {
        await guardAgainstUnsupportedSourceType(sourceImagePath);
      }),
    );

    await this.executeAdapter(
      'Conversion',
      'converter',
      compilation,
      pendingConversions,
    );
  }

  apply(compiler: Compiler) {
    // We initialize the generationCompleted promise here, since doing it outside would leave behind a dangling promise
    // when compilation is skipped altogether, eg. when Quasar SSG AE is used and no files has been changed since last build
    if (generationCompleted === undefined) {
      generationCompleted = new Promise<void>((resolve) => {
        releaseWhenGenerationCompletedTimeout = setTimeout(() => {
          if (generationStatus === 'completed') {
            resolve();
          } else {
            releaseWhenGenerationCompletedTimeout =
              releaseWhenGenerationCompletedTimeout.refresh();
          }
        }, 2000);
      });
    }

    this.logger = compiler.getInfrastructureLogger(this.pluginName);

    this.options.artDirection.transformer = resolveTransformer(
      this,
      this.options.artDirection.transformer,
    );

    this.options.resolutionSwitching.resizer = resolveResizer(
      this,
      this.options.resolutionSwitching.resizer,
    );

    this.options.conversion.converter = resolveConverter(
      this,
      this.options.conversion.converter,
    );

    this.adapters = {
      transformer: this.options.artDirection.transformer,
      resizer: this.options.resolutionSwitching.resizer,
      converter: this.options.conversion.converter,
    };

    compiler.resolverFactory.hooks.resolver
      .for('normal')
      .tap(this.pluginName, (resolver) => {
        this.resolveAliases = resolver.options.alias.filter(
          ({ onlyModule, alias }) => !onlyModule && typeof alias === 'string',
        ) as AliasOption[];
      });

    compiler.hooks.beforeCompile.tapPromise(this.pluginName, async () => {
      // Force dry run builds to wait the main build, so that underlying modules are up to date
      if (this.options.dryRun) {
        this.logger.info(
          'Dry run enabled for this plugin instance, waiting for main build to complete before proceeding...',
        );
        // Without this, we would get a race condition between compilations which would result in a broken build
        await generationCompleted;
      }
    });

    compiler.hooks.thisCompilation.tap(this.pluginName, (compilation) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (compilation as any).pluginContext = this;

      compilation.hooks.finishModules.tapPromise(
        this.pluginName,
        async (modules) => {
          if (this.options.dryRun) {
            return;
          }

          generationStatus = 'processing';

          await this.transformImages(compilation);
          await this.resizeImages(compilation);
          await this.convertImages(compilation);

          const modulesToRebuild: Module[] = [];

          for (const module of modules) {
            // TODO: Is this the correct way to check this?
            // Using `module.getSourceTypes().has('javascript')` won't work some some dynamic modules
            /* eslint-disable-next-line */
            if (!(module as any)?._source?._value) {
              continue;
            }

            // TODO: which would be the correct way of accessing this source?
            try {
              /* eslint-disable-next-line */
              const source: string = (module as any)._source._value;
              if (!URL_PLACEHOLDER_PATTERN.exec(source)) {
                continue;
              }

              modulesToRebuild.push(module);
            } catch (e) {
              this.logger.error(e, module);
              continue;
            }
          }

          await Promise.all(
            modulesToRebuild.map((module) =>
              rebuildModule(compilation, module),
            ),
          );

          generationStatus = 'completed';
        },
      );
    });
  }
}

export default ResponsiveImagePlugin;

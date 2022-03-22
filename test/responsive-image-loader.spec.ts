import { describe, expect, it } from '@jest/globals';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  IMG_TAG_PLACEHOLDER_PATTERN,
  URL_PLACEHOLDER_PATTERN,
} from 'src/parsing';
import { existsOrCreateDirectory } from '../src/base';
import { getHashDigest } from '../src/helpers';
import { compiler } from './compiler';

const TEMP_DIR = 'dist/temp/test';

async function setup(
  entryPath: string,
  options: Parameters<typeof compiler>[1] = {},
): Promise<string> {
  const stats = await compiler(entryPath, options);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const moduleData = stats.toJson({ source: true }).modules![0].source!;

  existsOrCreateDirectory(TEMP_DIR);

  const hash = getHashDigest(moduleData);
  const tempFileName = join(TEMP_DIR, `${hash}.js`);
  const path = resolve(__dirname, '..', tempFileName);
  writeFileSync(path, moduleData);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const sourceWithEscapedQuotes = (await import(path)).default as string;

  return sourceWithEscapedQuotes.replace(/\\"/g, '"');
}

function assertNoPlaceholders(output: string) {
  expect(output).not.toMatch(IMG_TAG_PLACEHOLDER_PATTERN);
  expect(output).not.toMatch(URL_PLACEHOLDER_PATTERN);
}

describe('Responsive image loader', () => {
  it('should error when __default alias is defined', async () => {
    await expect(
      setup('./assets/single-image.html', {
        viewportAliases: { __default: '1500' },
      }),
    ).rejects.toThrow();
  });

  describe('Plain images', () => {
    describe('conversion disabled', () => {
      const conversionDisabled = { conversion: { converter: null } };

      describe('resolution switching disabled', () => {
        const resolutionSwitchingDisabled = {
          resolutionSwitching: { resizer: null },
        };

        it.todo(
          'should not perform conversions when no converter is specified',
          // async () => {
          //   // const output = await setup('./assets/single-image.html');
          // },
        );

        describe('art direction enabled', () => {
          it('should not be performed when no transformer is provided', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: { transformer: null },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).not.toMatch(/<picture>/);
            assertNoPlaceholders(output);
          });

          it('should not be performed when no transformations are provided', async () => {
            const output = await setup('./assets/single-image.html', {
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).not.toMatch(/<picture>/);
            assertNoPlaceholders(output);
          });

          it('should add mime type when at least one transformation is defined', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '1200': { ratio: '2:3' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*type="image\/jpeg".*srcset=".*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should apply transformations when defined as defaults', async () => {
            const output = await setup('./assets/single-image.html', {
              defaultSize: 0.5,
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '1200': { ratio: '2:3' },
                  '1500': { ratio: '16:9' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1200px\)".*srcset=".*\/example-tb_1200-r_2_3-s_50.*\.jpg.*".*\/>.*<\/picture>/s,
            );
            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1500px\)".*srcset=".*\/example-tb_1500-r_16_9-s_50.*\.jpg.*".*\/>.*<\/picture>/s,
            );
            assertNoPlaceholders(output);
          });

          it('should apply transformation when defined via inline options', async () => {
            const output = await setup(
              './assets/single-image-inline-config.html',
              {
                viewportAliases: {
                  xs: '600',
                  md: '1023',
                },
                artDirection: {
                  transformer: 'thumbor',
                },
                ...conversionDisabled,
                ...resolutionSwitchingDisabled,
              },
            );

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 600px\)".*srcset=".*\/example-tb_600-r_3_2-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should merge inline options with default transformations when both are provided', async () => {
            const output = await setup(
              './assets/single-image-inline-config.html',
              {
                viewportAliases: {
                  xs: '600',
                  md: '1023',
                },
                artDirection: {
                  transformer: 'thumbor',
                  defaultTransformations: {
                    xs: { ratio: '5:3' },
                  },
                },
                ...conversionDisabled,
                ...resolutionSwitchingDisabled,
              },
            );

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 600px\)".*srcset=".*\/example-tb_600-r_3_2-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should apply transformation when its name is based on aliases', async () => {
            const output = await setup('./assets/single-image.html', {
              viewportAliases: {
                mdLowerHalf: '1200',
              },
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  mdLowerHalf: { ratio: '2:3' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1200px\)".*srcset=".*\/example-tb_1200-r_2_3-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should error when transformation name is invalid', async () => {
            // Undefined alias
            await expect(
              setup('./assets/single-image.html', {
                artDirection: {
                  transformer: 'thumbor',
                  defaultTransformations: {
                    lg: { ratio: '2:1' },
                  },
                },
                ...conversionDisabled,
                ...resolutionSwitchingDisabled,
              }),
            ).rejects.toThrow();

            // Characters problematic for a path
            await expect(
              setup('./assets/single-image.html', {
                artDirection: {
                  transformer: 'thumbor',
                  defaultTransformations: {
                    '%&:': { ratio: '2:1' },
                  },
                },
                ...conversionDisabled,
                ...resolutionSwitchingDisabled,
              }),
            ).rejects.toThrow();
          });

          // TODO: how can I check that the transformation is actually using the provided path?
          // Maybe check the hash of source and generated image?
          it('should resolve transformation to specific image when path is provided', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '600': { path: 'custom-example.jpg' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 600px\)".*srcset=".*\/example-tb_600-p-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should order transformations in ascending order', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '300': { ratio: '4:3' },
                  '1919': { ratio: '16:9' },
                  '2400': { ratio: '21:9' },
                  '1023': { ratio: '2:1' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 300px\)".*\/>.*<source.*media="\(max-width: 1023px\)".*<source.*media="\(max-width: 1919px\)".*\/>.*<source.*media="\(max-width: 2400px\)".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should preserve attributes on image tag', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '600': { ratio: '4:3' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<img.*responsive.*src="\.\/example\.jpg".*class="hello".*fake-attribute.*alt="hey there".*>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });

          it('should create one source for each art-direction transformation', async () => {
            const output = await setup('./assets/single-image.html', {
              artDirection: {
                transformer: 'thumbor',
                defaultTransformations: {
                  '600': { ratio: '4:3' },
                  '1024': { ratio: '2:1' },
                  '1440': { ratio: '2:3' },
                  '1920': { ratio: '16:9' },
                },
              },
              ...conversionDisabled,
              ...resolutionSwitchingDisabled,
            });

            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 600px\)".*srcset=".*\/example-tb_600-r_4_3-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1024px\)".*srcset=".*\/example-tb_1024-r_2_1-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1440px\)".*srcset=".*\/example-tb_1440-r_2_3-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            expect(output).toMatch(
              /<picture.*>.*<source.*media="\(max-width: 1920px\)".*srcset=".*\/example-tb_1920-r_16_9-s_100.*\.jpg.*".*\/>.*<\/picture>/gs,
            );
            assertNoPlaceholders(output);
          });
        });
      });

      describe('resolution switching enabled', () => {
        it.todo(
          'should apply breakpoints',
          // async () => {
          //   const output = await setup('./assets/single-image.html', {
          //     resolutionSwitching: {
          //       resizer: 'sharp',
          //       minViewport: 200,
          //       maxViewport: 1920,
          //       maxBreakpointsCount: 4,
          //       minSizeDifference: 35,
          //     },
          //     ...conversionDisabled,
          //   });

          //   // When supporting only one format, we should not use `<picture>` tag and only rely on `srcset`
          //   expect(output).toMatch(
          //     /<img.*srcset="\/example-b_\d*\.jpg.*\/example-b_\d*\.jpg.*".*\/>/gs,
          //   );
          // }
        );
      });
    });

    describe('multiple formats enabled', () => {
      const multipleFormatEnabled = {
        conversion: {
          converter: 'sharp' as const,
          enabledFormats: { webp: true, jpg: true },
        },
      };

      it('should perform conversions when a converter is specified', async () => {
        const output = await setup(
          './assets/single-image.html',
          multipleFormatEnabled,
        );

        expect(output).toMatch(/type="image\/webp"/);
        expect(output).toMatch(/type="image\/jpeg"/);
        assertNoPlaceholders(output);
      });

      it.todo(
        'should apply transformations and breakpoints for every enabled format',
        // async () => {
        //   //
        // },
      );

      it('should order formats by efficiency (webp > jpg)', async () => {
        const output = await setup(
          './assets/single-image.html',
          multipleFormatEnabled,
        );

        expect(output).toMatch(
          /<picture.*>.*<source.*type="image\/webp".*srcset=".*\.webp.*".*\/>.*<source.*type="image\/jpeg".*srcset=".*\.jpg.*".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });
    });

    describe('class management', () => {
      it('should not take place when no sources are generated', async () => {
        const output = await setup('./assets/single-image-shared-class.html', {
          conversion: { converter: null },
          resolutionSwitching: { resizer: null },
        });

        expect(output).toMatch(
          /<img.*class="hello there general-kenobi".*\/>/gs,
        );
        assertNoPlaceholders(output);
      });

      it('should apply all <img> classes to <picture>', async () => {
        const output = await setup('./assets/single-image-shared-class.html');

        expect(output).toMatch(
          /<picture class="hello there general-kenobi">.*<img.*class="hello there general-kenobi".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });

      it('should apply provided classes to <picture> when responsive-picture-class is present', async () => {
        const output = await setup('./assets/single-image-picture-class.html');

        expect(output).toMatch(
          /<picture class="general-kenobi">.*<img.*class="hello there".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });

      it('should not apply classes to <picture> when an empty responsive-picture-class is present', async () => {
        const output = await setup(
          './assets/single-image-picture-empty-class.html',
        );

        expect(output).toMatch(
          /<picture class="">.*<img.*class="hello there".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });

      it('should apply provided classes to <img> when responsive-img-class is present', async () => {
        const output = await setup('./assets/single-image-img-class.html');

        expect(output).toMatch(
          /<picture class="hello there">.*<img.*class="general-kenobi".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });

      it('should not apply classes to <img> when an empty responsive-img-class is present', async () => {
        const output = await setup(
          './assets/single-image-img-empty-class.html',
        );

        expect(output).toMatch(
          /<picture class="hello there">.*<img.*class="".*\/>.*<\/picture>/gs,
        );
        assertNoPlaceholders(output);
      });
    });
  });

  describe('Background images', () => {
    it('should add a picture element inside the marked container', async () => {
      const output = await setup('./assets/bg-image.html');

      expect(output).toMatch(
        /<div.*data-responsive-bg>.*<picture.*>.*<img.*\/>.*<\/picture>.*<h1>Hello there!<\/h1>.*<\/div>/gs,
      );
      assertNoPlaceholders(output);
    });
  });
});

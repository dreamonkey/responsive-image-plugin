import { JSONSchema7 } from 'json-schema';
import { DeepPartial } from 'ts-essentials';
import { LoaderContext } from 'webpack';
import { BaseConfig } from './base';
import { ConversionConfig } from './conversion';
import { deepFreeze } from './helpers';
import { ResizingConfig } from './resizing';
import { TransformationConfig } from './transformation';

export interface ResponsiveImagePluginConfig extends BaseConfig {
  conversion: ConversionConfig;
  artDirection: TransformationConfig;
  resolutionSwitching: ResizingConfig;
}

export type ResponsiveImageLoaderContext = LoaderContext<
  DeepPartial<ResponsiveImagePluginConfig>
>;

declare module 'json-schema' {
  interface JSONSchema7 {
    // TODO: register ajv-keywords custom instanceof validator
    // Unsure why they aren't registering it themselves
    instanceof?: string;
  }
}

export const OPTIONS_SCHEMA = deepFreeze<JSONSchema7>({
  title: 'Responsive image loader',
  type: 'object',
  properties: {
    defaultSize: { type: 'number' },
    viewportAliases: { type: 'object' },
    paths: {
      type: 'object',
      properties: {
        outputDir: { type: 'string' },
        // TODO: add more adherent properties check if possible
        aliases: { type: 'object' },
      },
      additionalProperties: false,
    },
    conversion: {
      type: 'object',
      properties: {
        converter: {
          oneOf: [
            { type: 'null' },
            { type: 'string' },
            { type: 'object', instanceof: 'Function' },
          ],
        },
        enabledFormats: {
          type: 'object',
          properties: {
            webp: { type: 'boolean' },
            jpg: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    artDirection: {
      type: 'object',
      properties: {
        transformer: {
          oneOf: [
            { type: 'null' },
            { type: 'string' },
            { type: 'object', instanceof: 'Function' },
          ],
        },
        defaultRatio: { type: 'string' },
        // TODO: add more adherent properties check if possible
        // TODO: turn it around to put the focus on ratio and path
        defaultTransformations: { type: 'object' },
      },
      additionalProperties: false,
    },
    resolutionSwitching: {
      type: 'object',
      properties: {
        resizer: {
          oneOf: [
            { type: 'null' },
            { type: 'string' },
            { type: 'object', instanceof: 'Function' },
          ],
        },
        supportRetina: { type: 'boolean' },
        minViewport: { type: 'number' },
        maxViewport: { type: 'number' },
        maxBreakpointsCount: { type: 'number' },
        minSizeDifference: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
});

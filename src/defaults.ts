import { deepFreeze } from './helpers';
import { ResponsiveImagePluginConfig } from './config';

export const DEFAULT_OPTIONS = deepFreeze<ResponsiveImagePluginConfig>({
  dryRun: false,
  outputDir: '/',
  defaultSize: 1.0,
  viewportAliases: {},
  conversion: {
    converter: 'sharp',
    enabledFormats: {
      webp: true,
      jpg: true,
    },
  },
  resolutionSwitching: {
    resizer: 'sharp',
    minViewport: 200,
    maxViewport: 3840,
    maxBreakpointsCount: 5,
    minSizeDifference: 35,
    supportRetina: true,
  },
  artDirection: {
    transformer: null,
    defaultRatio: 'original',
    defaultTransformations: {},
  },
});

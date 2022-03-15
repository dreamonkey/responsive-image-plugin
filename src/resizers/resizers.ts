import { ResponsiveImageLoaderContext } from '../config';
import { Breakpoint } from '../base';

export type ResizingAdapter = (
  this: ResponsiveImageLoaderContext,
  sourcePath: string,
  destinationPath: string,
  breakpointWindth: number,
) => Promise<Breakpoint>;

export type ResizingAdapterPresets = 'sharp';

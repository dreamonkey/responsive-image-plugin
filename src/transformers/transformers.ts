import { ResponsiveImageLoaderContext } from '../config';
import {
  TransformationDescriptor,
  TransformationSource,
} from '../transformation';

// Do not use lambda functions, they won't retain `this` context
export type TransformationAdapter = (
  this: ResponsiveImageLoaderContext,
  imagePath: string,
  transformations: TransformationDescriptor[],
) => Promise<TransformationSource[]>;

export type TransformationAdapterPresets = 'thumbor';

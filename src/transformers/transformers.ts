import { BaseAdapter } from '../base';
import { TransformationDescriptor } from '../transformation';

export type TransformationAdapter = BaseAdapter<
  [imagePath: string, transformation: TransformationDescriptor]
>;

export type TransformationAdapterPresets = 'thumbor';

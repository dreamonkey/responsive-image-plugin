import { BaseAdapter, SupportedImageFormats } from '../base';

export type ConversionAdapter = BaseAdapter<
  [sourcePath: string, format: SupportedImageFormats]
>;

export type ConversionAdapterPresets = 'sharp';

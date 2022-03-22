import { BaseAdapter, Breakpoint } from '../base';

export type ResizingAdapter = BaseAdapter<
  [sourcePath: string, breakpoint: Breakpoint]
>;

export type ResizingAdapterPresets = 'sharp';

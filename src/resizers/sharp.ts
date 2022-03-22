import sharp from 'sharp';
import { ResizingAdapter } from './resizers';

export const sharpResizer: ResizingAdapter = function (sourcePath, { width }) {
  // JPEGs created with Samsung cameras are corrupted because of a firmware bug
  // Official solution is to ignore the error while reading the file
  // See https://github.com/lovell/sharp/issues/1578#issuecomment-474299429
  const resizing = sharp(sourcePath, { failOnError: false }).resize(width);
  return resizing.toBuffer();
};

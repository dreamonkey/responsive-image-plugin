import { format, parse } from 'path';
import sharp from 'sharp';
import { generateResizingUri } from '../resizing';
import { ResizingAdapter } from './resizers';

export const sharpResizer: ResizingAdapter = async function (
  sourcePath,
  destinationPath,
  breakpointWidth,
) {
  // JPEGs created with Samsung cameras are corrupted because of a firmware bug
  // Official solution is to ignore the error while reading the file
  // See https://github.com/lovell/sharp/issues/1578#issuecomment-474299429
  const resizing = sharp(sourcePath, { failOnError: false }).resize(
    breakpointWidth,
  );
  const result = await resizing.toBuffer();

  const { uri, uriWithHash } = generateResizingUri(
    sourcePath,
    result,
    breakpointWidth,
  );

  destinationPath = format({
    dir: parse(destinationPath).dir,
    base: parse(uri).base,
  });

  this.emitFile(uriWithHash, result);
  await resizing.toFile(destinationPath);

  return { path: destinationPath, uri, uriWithHash, width: breakpointWidth };
};

import sharp from 'sharp';
import { ConversionAdapter } from './converters';

export const sharpConverter: ConversionAdapter = function (sourcePath, format) {
  // JPEGs created with Samsung cameras are corrupted because of a firmware bug
  // Official solution is to ignore the error while reading the file
  // See https://github.com/lovell/sharp/issues/1578#issuecomment-474299429
  const conversion = sharp(sourcePath, { failOnError: false }).toFormat(format);
  return conversion.toBuffer();
};

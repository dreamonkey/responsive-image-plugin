import { format as formatPath, parse } from 'path';
import sharp from 'sharp';
import { generateConversionUri } from '../conversion';
import { ConversionAdapter } from './converters';

export const sharpConverter: ConversionAdapter = async function (
  sourcePath,
  destinationPath,
  unhashedUri,
  format,
) {
  // JPEGs created with Samsung cameras are corrupted because of a firmware bug
  // Official solution is to ignore the error while reading the file
  // See https://github.com/lovell/sharp/issues/1578#issuecomment-474299429
  const conversion = sharp(sourcePath, { failOnError: false }).toFormat(format);
  const metadata = await conversion.metadata();
  const result = await conversion.toBuffer();
  const { uri, uriWithHash } = generateConversionUri(unhashedUri, result);

  destinationPath = formatPath({
    dir: parse(destinationPath).dir,
    base: parse(uri).base,
  });

  this.emitFile(uriWithHash, result);
  await conversion.toFile(destinationPath);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { path: sourcePath, uri, uriWithHash, width: metadata.width! };
};

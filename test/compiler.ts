import MemoryFileSystem from 'memory-fs';
import { resolve } from 'path';
import { DeepPartial } from 'ts-essentials';
import { Stats, webpack } from 'webpack';
import { ResponsiveImagePluginConfig } from '../src/config';
import ResponsiveImagePlugin from '../src/responsive-image-plugin';

export async function compiler(
  entryPath: string,
  options: DeepPartial<ResponsiveImagePluginConfig> = {},
): Promise<Stats> {
  const compiler = webpack({
    mode: 'production',
    context: __dirname,
    entry: entryPath,
    output: {
      path: resolve(__dirname),
      filename: 'bundle.js',
    },
    infrastructureLogging: { level: 'none' },
    // infrastructureLogging: { level: 'log' },
    plugins: [new ResponsiveImagePlugin(options)],
    module: {
      rules: [
        {
          test: /\.html$/,
          // Remember loaders are applied in reverse order
          use: [
            // Transforms into a JS module returning the raw generated string
            'raw-loader',
            // Our loader
            ResponsiveImagePlugin.loader,
          ],
        },
      ],
    },
  });

  compiler.outputFileSystem = new MemoryFileSystem();

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        reject(err);
      }
      if (stats) {
        if (stats.hasErrors()) {
          reject(
            new Error(
              stats
                .toJson()
                .errors?.map(({ message }) => message)
                .join(' // '),
            ),
          );
        }

        resolve(stats);
      }
    });
  });
}

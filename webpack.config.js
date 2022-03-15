const bgImageHandlerFolder = './dist/src/background-image-handler';
const bgImageHandlerPath = `${bgImageHandlerFolder}/background-image-handler`;
const staticGenerationFallbackPath = `${bgImageHandlerFolder}/static-generation-fallback`;

const { resolve } = require('path');
const handlerFnName = require(bgImageHandlerPath).default.name;

module.exports = {
  mode: 'production',
  entry: [staticGenerationFallbackPath, bgImageHandlerPath],
  output: {
    path: resolve(__dirname, 'dist/src'),
    library: handlerFnName,
    libraryExport: 'default',
    libraryTarget: 'window',
  },
};

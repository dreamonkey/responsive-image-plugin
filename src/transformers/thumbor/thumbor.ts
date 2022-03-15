import { ChildProcess, exec, spawn } from 'child_process';
import { writeFileSync } from 'fs';
import got from 'got';
import { map } from 'lodash';
import { join, parse } from 'path';
import { getTempImagesDir } from '../../base';
import { ResponsiveImageLoaderContext } from '../../config';
import {
  generateTransformationUri,
  isCustomTransformation,
  TransformationDescriptor,
  TransformationSource,
} from '../../transformation';
import { TransformationAdapter } from '../transformers';

const THUMBOR_URL = 'http://localhost';
const THUMBOR_PORT = '8888';
const THUMBOR_ENV_PATH = join(__dirname, '.thumbor-env');
// This is the default into MinimalCompact/thumbor configuration
const THUMBOR_FILE_LOADER_ROOT_PATH = '/data/loader';
const CURRENT_WORKING_DIRECTORY_PATH = process.cwd();

const DOCKER_CONTAINER_NAME = 'ril-thumbor';

let DOCKER_PROCESS: ChildProcess | undefined;
let DOCKER_PROCESS_KILL_TIMEOUT: NodeJS.Timeout;
let JOBS_IN_QUEUE = 0;

function generateTransformationUrl(
  imagePath: string,
  transformation: TransformationDescriptor,
): string {
  const urlStart = `${THUMBOR_URL}:${THUMBOR_PORT}/unsafe/`;
  const urlSmart = '/smart/';
  const { size, maxViewport } = transformation;
  const scaledViewport = Math.ceil(maxViewport * size);

  let cropping: string;
  let path: string;

  if (isCustomTransformation(transformation)) {
    // Custom transformations should already be at the right dimension,
    //  we just resize them to be maximum of the given viewport size
    cropping = `${scaledViewport}x0`;
    path = transformation.path;
  } else {
    const { ratio } = transformation;
    const [horizontalRatio, verticalRatio] =
      ratio === 'original' ? [] : map(ratio.split(':'), Number);

    const cropWidth = scaledViewport;
    const cropHeight =
      ratio === 'original'
        ? 0
        : Math.ceil((cropWidth / horizontalRatio) * verticalRatio);

    cropping = `${cropWidth}x${cropHeight}`;
    path = imagePath;
  }
  path = path.replace(CURRENT_WORKING_DIRECTORY_PATH, '');

  return urlStart + cropping + urlSmart + path;
}

function createFiles(
  this: ResponsiveImageLoaderContext,
  imagePath: string,
  transformations: TransformationDescriptor[],
): Promise<TransformationSource[]> {
  return Promise.all(
    map(transformations, async (transformation) => {
      const url = generateTransformationUrl(imagePath, transformation);

      try {
        const result = await got(url).buffer();

        const { uri, uriWithHash } = generateTransformationUri(
          imagePath,
          result,
          transformation,
        );

        const { base } = parse(uri);
        const path = join(getTempImagesDir(), base);

        this.emitFile(uriWithHash, result);
        writeFileSync(path, result);

        return {
          ...transformation,
          path,
          breakpoints: [
            {
              path,
              uri,
              uriWithHash,
              width: transformation.maxViewport * transformation.size,
            },
          ],
        };
      } catch (e) {
        this.emitError(e as Error);
        throw e;
      }
    }),
  );
}

let dockerInstancesProgressiveId = 0;

// Do not use lambda functions, they won't retain `this` context
export const thumborDockerTransformer: TransformationAdapter = async function (
  imagePath,
  transformations,
) {
  JOBS_IN_QUEUE++;

  // The whole "keep thumbor process alive" system is needed as we don't have access to compilation hooks into loaders
  // and we prefer avoiding using plugins for the time being
  // TODO: convert to a plugin to start and stop thumbor container using compilation hooks and remove this process management
  if (!DOCKER_PROCESS) {
    // If the previous instance has been killed and another one must be spawned,
    // we use a progressive id to avoid naming conflicts, since the previous container takes some time to shut down
    const containerName = `${DOCKER_CONTAINER_NAME}-${dockerInstancesProgressiveId++}`;

    DOCKER_PROCESS = spawn(
      'docker',
      [
        'run',
        '-p',
        `${THUMBOR_PORT}:80`,
        '--name',
        containerName,
        '--env-file',
        THUMBOR_ENV_PATH,
        '--mount',
        `type=bind,source=${process.cwd()},target=${THUMBOR_FILE_LOADER_ROOT_PATH},readonly`,
        '--rm',
        'minimalcompact/thumbor',
      ],
      // Shows output into the console
      { stdio: 'inherit' },
    );
    DOCKER_PROCESS.on('error', (err) =>
      this.emitError(
        new Error(
          `An error has been thrown while running the docker container with text "${err.message}", have you installed docker and run "docker pull minimalcompact/thumbor"?`,
        ),
      ),
    );

    DOCKER_PROCESS_KILL_TIMEOUT = setTimeout(() => {
      if (JOBS_IN_QUEUE === 0) {
        DOCKER_PROCESS?.kill();
        exec(`docker container stop ${containerName}`);
        DOCKER_PROCESS = undefined;
      } else {
        DOCKER_PROCESS_KILL_TIMEOUT = DOCKER_PROCESS_KILL_TIMEOUT.refresh();
      }
      // We use an exotic timeout value to minimize issues related to process scheduling race conditions
      // This is mostly needed for tests for which timers are probably batched by Jest, it shouldn't matter
      // for real world usage
    }, 3333);
  }

  const transformationSources: TransformationSource[] = [];

  try {
    transformationSources.push(
      ...(await createFiles.call(this, imagePath, transformations)),
    );
  } catch (e) {
    console.error(e);
  }

  JOBS_IN_QUEUE--;
  return transformationSources;
};

import { ChildProcess, exec as originalExec, spawn } from 'child_process';
import got from 'got';
import { join } from 'path';
import { promisify } from 'util';
import { pluginContext } from '../../base';
import { convertRatioStringToNumber } from '../../helpers';
import {
  isCustomTransformation,
  TransformationDescriptor,
} from '../../transformation';
import { TransformationAdapter } from '../transformers';
const exec = promisify(originalExec);

const THUMBOR_URL = 'http://localhost';
const THUMBOR_PORT = '8888';
const THUMBOR_ENV_PATH = join(__dirname, '.thumbor-env');
// This is the default into MinimalCompact/thumbor configuration
const THUMBOR_FILE_LOADER_ROOT_PATH = '/data/loader';
const CURRENT_WORKING_DIRECTORY_PATH = process.cwd();

const DOCKER_CONTAINER_NAME = 'ril-thumbor';

let dockerProcess: ChildProcess | undefined;

function generateTransformationUrl(
  imagePath: string,
  transformation: TransformationDescriptor,
): string {
  const urlStart = `${THUMBOR_URL}:${THUMBOR_PORT}/unsafe/`;
  const urlSmart = '/smart/';
  const { size, maxViewport } = transformation;
  const scaledViewport = Math.ceil(maxViewport * size);
  const path = imagePath.replace(CURRENT_WORKING_DIRECTORY_PATH, '');

  let cropping: string;

  if (isCustomTransformation(transformation)) {
    // Custom transformations should already be at the right dimension,
    //  we just resize them to be maximum of the given viewport size
    cropping = `${scaledViewport}x0`;
  } else {
    const { ratio } = transformation;

    const cropWidth = scaledViewport;
    const cropHeight =
      ratio === 'original'
        ? 0
        : Math.ceil(cropWidth * convertRatioStringToNumber(ratio));

    cropping = `${cropWidth}x${cropHeight}`;
  }

  return urlStart + cropping + urlSmart + path;
}

function setup() {
  dockerProcess = spawn(
    'docker',
    [
      'run',
      '-p',
      `${THUMBOR_PORT}:80`,
      '--name',
      DOCKER_CONTAINER_NAME,
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
  dockerProcess.on('error', (err) =>
    pluginContext.logger.error(
      new Error(
        `An error has been thrown while running the docker container with text "${err.message}", have you installed docker and run "docker pull minimalcompact/thumbor"?`,
      ),
    ),
  );
}

async function teardown() {
  dockerProcess?.kill();
  // When executing multiple builds in sequence, as we do when testing,
  // this is needed to avoid the shutting down container to block the setup
  // of a new one
  await exec(`docker container stop ${DOCKER_CONTAINER_NAME}`);
  dockerProcess = undefined;
}

export const thumborDockerTransformer: TransformationAdapter = (
  imagePath,
  transformation,
) => {
  const url = generateTransformationUrl(imagePath, transformation);

  return got(url).buffer();
};

thumborDockerTransformer.setup = setup;
thumborDockerTransformer.teardown = teardown;

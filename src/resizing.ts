import { existsSync, statSync, writeFileSync } from 'fs';
import { isNull, isUndefined, map, times } from 'lodash';
import { format, join, parse } from 'path';
import { Breakpoint, generateUri, getTempImagesDir, SizesMap } from './base';
import { ResponsiveImageLoaderContext } from './config';
import { deepFreeze, selectFromPreset } from './helpers';
import { ResponsiveImage } from './parsing';
import { ResizingAdapter, ResizingAdapterPresets } from './resizers/resizers';
import { sharpResizer } from './resizers/sharp';
import {
  byIncreasingMaxViewport,
  isTransformationSource,
  TransformationSource,
} from './transformation';

const DUMMY_IMAGE_PATH = 'dummy-image.gif';
// Taken from http://png-pixel.com/
const DUMMY_IMAGE_BASE64_DATA = Buffer.from(
  'R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
);

function getEmptyImagePath(): string {
  const path = join(getTempImagesDir(), DUMMY_IMAGE_PATH);
  if (!existsSync(path)) {
    writeFileSync(path, DUMMY_IMAGE_BASE64_DATA);
  }
  return path;
}

type ResizingAdapterPresetsMap = {
  [index in ResizingAdapterPresets]: ResizingAdapter;
};

const presetResizers: ResizingAdapterPresetsMap = deepFreeze({
  sharp: sharpResizer,
});

export interface ResizingConfig {
  resizer: ResizingAdapterPresets | ResizingAdapter | null;
  minViewport: number;
  maxViewport: number;
  maxBreakpointsCount: number;
  minSizeDifference: number;
  supportRetina: boolean;
}

interface ResizingIntervalDelimiter {
  path: string;
  // We cannot directly calculate the delimiter width because interval range
  //  and breakpoints calculation depends by the image size in that interval,
  //  which is the size of the upper end delimiter
  size: number;
  viewport: number;
}

type ResizingIntervalDelimiterWithScaledWidth = ResizingIntervalDelimiter & {
  width: number;
};

interface ResizingInterval {
  startDelimiter: ResizingIntervalDelimiterWithScaledWidth;
  endDelimiter: ResizingIntervalDelimiterWithScaledWidth;
  breakpointsCount: number;
}

export const generateResizingUri = (
  path: string,
  content: Buffer,
  breakpoint: number,
): ReturnType<typeof generateUri> =>
  // 'b' stands for 'breakpoint'
  generateUri(path, content, () => `-b_${breakpoint}`);

export function byIncreasingWidth(a: Breakpoint, b: Breakpoint): number {
  return a.width - b.width;
}

function generateIntervalDelimiters(
  sources: TransformationSource[],
  originalPath: string,
  minViewport: number,
  maxViewport: number,
  sizes: SizesMap,
): ResizingIntervalDelimiter[] {
  const delimiters: ResizingIntervalDelimiter[] = sources
    .sort(byIncreasingMaxViewport)
    .map(({ path, maxViewport, size }) => ({
      path,
      size,
      viewport: maxViewport,
    }));

  let firstDelimiterAfterMinViewport: ResizingIntervalDelimiter | undefined;
  let lastDelimiterAfterMaxViewport: ResizingIntervalDelimiter | undefined;

  for (let index = 0; index < delimiters.length; index++) {
    const delimiter = delimiters[index];
    if (
      isUndefined(firstDelimiterAfterMinViewport) &&
      delimiter.viewport > minViewport
    ) {
      firstDelimiterAfterMinViewport = delimiter;
    }
    if (delimiter.viewport > maxViewport) {
      lastDelimiterAfterMaxViewport = delimiter;
    }
  }

  const minDelimiter: ResizingIntervalDelimiter = {
    ...(!isUndefined(firstDelimiterAfterMinViewport)
      ? firstDelimiterAfterMinViewport
      : {
          // We need minDelimiter image size to be 0 when checked later on,
          //  so we provide a path to an empty image
          path: getEmptyImagePath(),
          size: sizes[`${maxViewport}`] ?? sizes.__default,
        }),
    viewport: minViewport,
  };

  const maxDelimiter: ResizingIntervalDelimiter = {
    ...(!isUndefined(lastDelimiterAfterMaxViewport)
      ? lastDelimiterAfterMaxViewport
      : {
          path: originalPath,
          size: sizes[`${maxViewport}`] ?? sizes.__default,
        }),
    viewport: maxViewport,
  };

  const delimitersWithinRange = delimiters.filter(
    ({ viewport }) => viewport > minViewport || viewport < maxViewport,
  );

  return [minDelimiter, ...delimitersWithinRange, maxDelimiter];
}

function calculateDelimiterWidth(viewport: number, size: number): number {
  // `size` lower or equal to 1.0 are considered a viewport percentage
  // If greater, it's considered as an absolute value in px
  return size > 1.0 ? size : Math.ceil(viewport * size);
}

function generateIntervals(
  delimiters: ResizingIntervalDelimiter[],
  maxBreakpoints: number,
): ResizingInterval[] {
  const intervalCount = delimiters.length - 1;
  const breakpointsPerInterval = Math.floor(maxBreakpoints / intervalCount);
  const intervals: ResizingInterval[] = [];

  for (let index = 1; index < delimiters.length; index++) {
    const currentDelimiter = delimiters[index];
    const previousDelimiter = delimiters[index - 1];
    // After tring to divide breakpoints equally, we distribute
    //  remainder starting from lower intervals
    const breakpointsCount =
      breakpointsPerInterval +
      (maxBreakpoints % intervalCount >= index ? 1 : 0);

    intervals.push({
      // Delimiters width are related to viewports but
      //  both must be calculated from the end delimiter size proportion
      //  to have a coherent value
      startDelimiter: {
        ...previousDelimiter,
        width: calculateDelimiterWidth(
          previousDelimiter.viewport,
          currentDelimiter.size,
        ),
      },
      endDelimiter: {
        ...currentDelimiter,
        width: calculateDelimiterWidth(
          currentDelimiter.viewport,
          currentDelimiter.size,
        ),
      },
      breakpointsCount,
    });
  }
  return intervals;
}

async function generateBreakpoints(
  this: ResponsiveImageLoaderContext,
  resizer: ResizingAdapter,
  minStepSize: number,
  currentInterval: ResizingInterval,
  nextInterval: ResizingInterval | undefined,
): Promise<Breakpoint[]> {
  let breakpoints: Breakpoint[];
  let allStepsAreWideEnough: boolean;

  do {
    const { breakpointsCount, startDelimiter, endDelimiter } = currentInterval;
    const breakpointUnit = Math.floor(
      (endDelimiter.width - startDelimiter.width) / (breakpointsCount + 1),
    );
    const breakpointViewports = times(
      breakpointsCount,
      (index) => startDelimiter.width + breakpointUnit * (index + 1),
    );

    breakpoints = await Promise.all(
      breakpointViewports.map((breakpoint) =>
        resizer.call(
          this,
          endDelimiter.path,
          format({
            dir: getTempImagesDir(),
            base: parse(endDelimiter.path).base,
          }),
          breakpoint,
        ),
      ),
    );

    const imagesSizes = [startDelimiter, ...breakpoints, endDelimiter].map(
      (breakpointOrDelimiter) => statSync(breakpointOrDelimiter.path).size,
    );

    allStepsAreWideEnough = true;

    for (let index = 1; index < imagesSizes.length; index++) {
      const previousSize = imagesSizes[index - 1];
      const currentSize = imagesSizes[index];
      if (currentSize - previousSize < minStepSize * 1000) {
        // Difference in sizes between breakpoints are too narrow
        // We bubble up the breakpoint to next interval range, if there is one,
        //  or just drop it, if current interval is the last one
        currentInterval.breakpointsCount--;
        if (!isUndefined(nextInterval)) {
          nextInterval.breakpointsCount++;
        }

        allStepsAreWideEnough = false;
        break;
      }
    }
  } while (currentInterval.breakpointsCount !== 0 && !allStepsAreWideEnough);

  return breakpoints;
}

/*
  Breakpoints generation adds as many breakpoints as possible
    into narrow viewports (smartphones), which suffer high budle
    sizes the most (eg. when using data network);
    it also grants some breakpoints to wider viewports (laptops, desktops),
    where is less critical to save bandwidth.
  If narrow viewports need less breakpoints than originally allocated
    for them, those breakpoints are re-allocated to wider viewports
    and removed when they cannot be used in the widest viewport available.
*/
export async function resizeImage(
  this: ResponsiveImageLoaderContext,
  image: ResponsiveImage,
  {
    resizer,
    minViewport,
    maxViewport,
    maxBreakpointsCount,
    minSizeDifference,
  }: ResizingConfig,
): Promise<ResponsiveImage> {
  if (typeof resizer === 'string') {
    try {
      resizer = selectFromPreset(presetResizers, resizer);
    } catch (e) {
      this.emitError(e as Error);
      resizer = null;
    }
  }

  if (isNull(resizer)) {
    return Promise.resolve(image);
  }

  const artDirectionSources = image.sources.filter((source) =>
    isTransformationSource(source),
  ) as TransformationSource[];

  const viewportToSourceMap = new Map<number, TransformationSource>(
    map(artDirectionSources, (source) => [source.maxViewport, source]),
  );

  const intervalDelimiters = generateIntervalDelimiters(
    artDirectionSources,
    image.originalPath,
    minViewport,
    maxViewport,
    image.options.sizes,
  );

  const intervals = generateIntervals(intervalDelimiters, maxBreakpointsCount);

  for (let index = 0; index < intervals.length; index++) {
    const currentInterval = intervals[index];
    const nextInterval =
      intervals.length > index + 1 ? intervals[index + 1] : undefined;

    // We skip this interval if no breakpoints can be allocated for it
    if (currentInterval.breakpointsCount === 0) {
      continue;
    }

    // If the size of the source image for this interval is less
    //  than 2 times the minimum size difference we know no breakpoints can be put here.
    // We add its breakpointsCount to the next interval (if any) and move on
    if (
      statSync(currentInterval.endDelimiter.path).size <
      minSizeDifference * 1000 * 2
    ) {
      nextInterval &&
        (nextInterval.breakpointsCount += currentInterval.breakpointsCount);
      continue;
    }

    const breakpoints = await generateBreakpoints.call(
      this,
      resizer,
      minSizeDifference,
      currentInterval,
      nextInterval,
    );

    if (breakpoints.length > 0) {
      const endViewport = currentInterval.endDelimiter.viewport;

      let intervalSource = viewportToSourceMap.get(endViewport);

      if (isUndefined(intervalSource)) {
        const fallbackSource = {
          breakpoints: [],
          maxViewport: endViewport,
          path: image.originalPath,
          size: image.options.sizes.__default,
        };
        viewportToSourceMap.set(endViewport, fallbackSource);
        intervalSource = fallbackSource;
      }

      intervalSource.breakpoints.push(...breakpoints);
    }
  }

  image.sources = Array.from(viewportToSourceMap.values());

  return image;
}

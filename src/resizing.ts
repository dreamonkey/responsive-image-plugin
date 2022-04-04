import sizeOf from 'image-size';
import { isNull, isUndefined, map, times } from 'lodash';
import { format, parse } from 'path';
import { Breakpoint, generateUri, getTempImagesDir, SizesMap } from './base';
import {
  convertRatioStringToNumber,
  deepFreeze,
  selectFromPreset,
} from './helpers';
import { ResponsiveImage } from './parsing';
import { ResizingAdapter, ResizingAdapterPresets } from './resizers/resizers';
import { sharpResizer } from './resizers/sharp';
import ResponsiveImagePlugin from './responsive-image-plugin';
import {
  byIncreasingMaxViewport,
  isTransformationSource,
  TransformationSource,
} from './transformation';

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
  ratio: number;
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
  pluginContext: ResponsiveImagePlugin,
  path: string,
  breakpoint: number,
): ReturnType<typeof generateUri> =>
  // 'b' stands for 'breakpoint'
  generateUri(pluginContext, path, () => `-b_${breakpoint}`);

export function byIncreasingWidth(a: Breakpoint, b: Breakpoint): number {
  return a.width - b.width;
}

function getImgRatio(path: string): number {
  const { height, width } = sizeOf(path);

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return height! / width!;
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
    .map(({ path, maxViewport, ratio, size }) => ({
      path,
      size,
      ratio: convertRatioStringToNumber(ratio),
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
          path: 'dummy-path',
          // We need minDelimiter estimated image size to be 0 when checked later on,
          //  so we provide a ratio of 0, which will result into a size of 0 bytes
          ratio: 0,
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
          ratio: getImgRatio(originalPath),
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

function toKb(size: number): number {
  return size / 1024;
}

function estimateSize(width: number, ratio: number): number {
  const height = Math.ceil(width * ratio);
  return height * width;
}

function estimateSizeOfBreakpointOrDelimiter(
  breakpointOrDelimiter: ResizingIntervalDelimiterWithScaledWidth | Breakpoint,
  defaultRatio: number,
): number {
  const ratio =
    (breakpointOrDelimiter as ResizingIntervalDelimiterWithScaledWidth).ratio ??
    defaultRatio;

  // TODO: take into consideration the original format and enabled conversion formats to better estimate the final size
  // TODO: WebP is at least 25% more compression-efficient than JPG: https://developers.google.com/speed/webp/docs/webp_study
  // Breakpoints/delimiter haven't been generated yet, but we can estimate their size
  return estimateSize(breakpointOrDelimiter.width, ratio);
}

function generateBreakpoints(
  pluginContext: ResponsiveImagePlugin,
  minStepSize: number,
  currentInterval: ResizingInterval,
  nextInterval: ResizingInterval | undefined,
): Breakpoint[] {
  let breakpoints: Breakpoint[];
  let areAllStepsWideEnough: boolean;

  do {
    const { breakpointsCount, startDelimiter, endDelimiter } = currentInterval;
    const breakpointUnit = Math.floor(
      (endDelimiter.width - startDelimiter.width) / (breakpointsCount + 1),
    );
    const breakpointViewports = times(
      breakpointsCount,
      (index) => startDelimiter.width + breakpointUnit * (index + 1),
    );

    breakpoints = breakpointViewports.map((breakpoint) => {
      const uri = generateResizingUri(
        pluginContext,
        endDelimiter.path,
        breakpoint,
      );

      const destinationPath = format({
        dir: getTempImagesDir(),
        base: parse(uri).base,
      });

      return { path: destinationPath, uri, width: breakpoint };
    });

    const imagesSizes = [startDelimiter, ...breakpoints, endDelimiter].map(
      (breakpointOrDelimiter) =>
        toKb(
          estimateSizeOfBreakpointOrDelimiter(
            breakpointOrDelimiter,
            endDelimiter.ratio,
          ),
        ),
    );

    areAllStepsWideEnough = true;

    for (let index = 1; index < imagesSizes.length; index++) {
      const previousSize = imagesSizes[index - 1];
      const currentSize = imagesSizes[index];
      if (currentSize - previousSize < minStepSize) {
        // Difference in sizes between breakpoints are too narrow
        // We bubble up the breakpoint to next interval range, if there is one,
        //  or just drop it, if current interval is the last one
        currentInterval.breakpointsCount--;
        if (!isUndefined(nextInterval)) {
          nextInterval.breakpointsCount++;
        }

        areAllStepsWideEnough = false;
        break;
      }
    }
  } while (currentInterval.breakpointsCount !== 0 && !areAllStepsWideEnough);

  return breakpoints;
}

export const pendingResizes: [
  sourceImagePath: string,
  breakpoint: Breakpoint,
  uri: string,
][] = [];

/*
  Breakpoints generation adds as many breakpoints as possible
    into narrow viewports (smartphones), which suffer high bundle
    sizes the most (eg. when using data network);
    it also grants some breakpoints to wider viewports (laptops, desktops),
    where is less critical to save bandwidth.
  If narrow viewports need less breakpoints than originally allocated
    for them, those breakpoints are re-allocated to wider viewports
    and removed when they cannot be used in the widest viewport available.
*/
export function applyResizes(
  pluginContext: ResponsiveImagePlugin,
  image: ResponsiveImage,
): void {
  const {
    resizer,
    minViewport,
    maxViewport,
    maxBreakpointsCount,
    minSizeDifference,
  } = pluginContext.options.resolutionSwitching;

  if (isNull(resizer)) {
    return;
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

    const { width, ratio } = currentInterval.endDelimiter;
    // If the size of the source image for this interval is less
    //  than 2 times the minimum size difference we know no breakpoints can be put here.
    // We add its breakpointsCount to the next interval (if any) and move on
    if (toKb(estimateSize(width, ratio)) < minSizeDifference * 2) {
      nextInterval &&
        (nextInterval.breakpointsCount += currentInterval.breakpointsCount);
      continue;
    }

    const breakpoints = generateBreakpoints(
      pluginContext,
      minSizeDifference,
      currentInterval,
      nextInterval,
    );

    if (breakpoints.length > 0) {
      const endViewport = currentInterval.endDelimiter.viewport;

      let intervalSource = viewportToSourceMap.get(endViewport);

      if (isUndefined(intervalSource)) {
        const fallbackSource: TransformationSource = {
          breakpoints: [],
          maxViewport: endViewport,
          path: image.originalPath,
          ratio: 'original',
          size: image.options.sizes.__default,
          isCustom: false,
        };
        viewportToSourceMap.set(endViewport, fallbackSource);
        intervalSource = fallbackSource;
      }

      intervalSource.breakpoints.push(...breakpoints);

      for (const breakpoint of breakpoints) {
        pendingResizes.push([intervalSource.path, breakpoint, breakpoint.uri]);
      }
    }
  }

  image.sources = Array.from(viewportToSourceMap.values());
}

export function resolveResizer(
  pluginContext: ResponsiveImagePlugin,
  resizer: ResizingConfig['resizer'],
) {
  if (typeof resizer === 'string') {
    resizer = selectFromPreset(pluginContext, presetResizers, resizer);
  }

  return resizer;
}

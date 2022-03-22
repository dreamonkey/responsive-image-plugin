# responsive-image-loader

**New package, who dis?**

A webpack plugin to automagically bring your website images to a whole new level of responsiveness!
This plugin derives from our previous attempt to solve the same problem [using only a webpack loader](https://github.com/dreamonkey/responsive-image-loader).

This plugin tackles in an unified way three main problems with images on the web nowadays:

- intelligent images transformation based on focal points of an image (art direction);
- images resizing to always serve the lightest bundle possible (resolution switching);
- usage of most efficient image formats (automatic conversion).

Moreover, we aim to automatize everything that doesn't strictly require your input:

- calculating best breakpoints for resolution switching;
- ordering sources by most efficient image format;
- providing sensible defaults;
- serving a fallback for older browsers;
- and more!

We also focused on flexiblity and customizability: transformation, resizing and conversion engines can be easily switched with your implementation, which you can then PR here and make available to others.

**Aren't there other tools doing the same stuff?**
![Well yes, but actually no](docs/well-yes-but-actually-no.jpg?raw=true)
We found some notable tools while evaluating if it was worth to create our own package, but none of them combines all the requirements we now offer:

- manages together art direction, resolution switching and conversion, with all their weird interactions;
- process images both when used via `<img>` tags and `background-image` CSS rules;
- framework agnostic;
- operates at build time (useful for SSG builds);
- works offline;
- free;
- open source;
- customizable and flexible at its core.

For more info, check out the [issue](https://github.com/quasarframework/quasar/issues/5383#issue-511313782) from which this package spawned.

## Table of contents

- [Roadmap](#roadmap)
- [Donations and shameless self-advertisement](#donations)
- [Installation](#installation)
  - [Plugin](#plugin)
  - [Engines](#engines)
- [Usage](#usage)
- [Configuration](#configuration)
  - [Global configuration](#global-configuration)
  - [Paths](#paths)
  - [Conversion](#conversion)
  - [Resolution Switching](#resolution-switching)
  - [Art Direction](#art-direction)
- [Caveats & FAQ](#caveats-faq)
- [Contributing](#contributing)
- [License](#license)

## <a name="roadmap"></a> Roadmap

Features we'd like to implement, by most-wanted order.

<!-- TODO: -->

- [ ] [Add PNG to supported formats](https://github.com/dreamonkey/responsive-image-loader/issues/16)
- [ ] [Define defaults for arbitrary groups of images](https://github.com/dreamonkey/responsive-image-loader/issues/10)
- [ ] [Write more granular unit tests](https://github.com/dreamonkey/responsive-image-loader/issues/17)
- [ ] [Add TSDocs to public methods](https://github.com/dreamonkey/responsive-image-loader/issues/18)
- [ ] [Support Cloudinary adapter for transformer, resizer and converter](https://github.com/dreamonkey/responsive-image-loader/issues/15)
- [ ] [Support video conversion and processing](https://github.com/dreamonkey/responsive-image-loader/issues/11)
- [ ] [Test with HMR](https://github.com/dreamonkey/responsive-image-loader/issues/14)
- [ ] [Pass-through custom configuration to underlying engines](https://github.com/dreamonkey/responsive-image-loader/issues/19)

## <span id="donations"></span> Donations and shameless self-advertisement

[Dreamonkey](https://dreamonkey.com/) is a software house based in Reggio Emilia, Italy.
We release packages as open-source when we feel they could benefit the entire community, nontheless we spend a considerabile amount of time studying, coding, maintaining and enhancing them.

Does your business or personal projects depend on our packages? Consider donating here on Github to help us maintain them and allow us to create new ones!

Do you need a UX and quality driven team to work on your project? Get in touch with us through our [incredibly elaborate quotation request page](https://dreamonkey.com/en/contacts/request-quotation) or our [much less cool contact form](https://dreamonkey.com/en/contacts/contact-us) and let's find out if we are the right choice for you!

## <span id="installation"></span> Installation

Install via

`yarn add -D @dreamonkey/responsive-image-loader`

or

`npm install -D @dreamonkey/responsive-image-loader`.

### <span id="plugin"></span> Plugin

#### Normal usage

Add the plugin into your webpack config.

<!-- TODO: -->

```javascript
webpackConf.module.rules.push({
  test: /\.html$/,
  loader: '@dreamonkey/responsive-image-loader',
  options: {
    /* ... */
  },
});
```

If you plan to process CSS background images, you should also include the package as you'd do with a [polyfill](https://webpack.js.org/guides/shimming/#loading-polyfills).

```javascript
webpackConf.entry['responsive-bg-image-handler'] =
  '@dreamonkey/responsive-image-loader';
```

```html
<!--
NB: `src` attribute value could change dependending on your webpack `output.filename` (https://webpack.js.org/configuration/output/#outputfilename) and `output` configuration, you're not bound to ``
-->
<script src="./responsive-bg-image-handler.js">
```

#### On Quasar framework

Presumely due to some kind of incompatibility with [theirs HTML loader](https://github.com/quasarframework/quasar/issues/5383#issuecomment-560510363), you must tap into low level Vue template to use this loader with [Quasar framework](https://quasar.dev/) (on which it has been tested and developed).

```javascript
webpackConf.module.rules.push({
  test: /\.vue$/,
  resourceQuery: /type=template/,
  loader: '@dreamonkey/responsive-image-loader',
  options: {
    paths: {
      /* Quasar output folder */
      outputDir: '/img/',
      /* Quasar webpack aliases */
      aliases: {
        '~': 'src/',
        /* ... */
      },
    },
    /* ... */
  },
});
```

It is not possible to specify only `test: /\.vue$/` because Vue templates are actually [processed many times](https://github.com/vuejs/vue-loader/issues/1164#issuecomment-370947737) (one for general file plus one per each used tag) and this would break the loader workflow.
A caching mechanism (as suggested by Vue creator in this cases) won't work efficiently and will break framework-agnosticism.

If you plan to process CSS background images, you should also include the package as you'd do with a [polyfill](https://webpack.js.org/guides/shimming/#loading-polyfills).

```javascript
webpackConf.entry['responsive-bg-image-handler'] =
  '@dreamonkey/responsive-image-loader';
```

You don't need to manually include it via a `script` tag as Quasar already does it automatically for every `entry` property.

### <span id="engines"></span> Engines

Conversion, art direction and resolution switching are powered via an adapter by a fully decoupled and swappable engine.
Every engine has its installation guide (independent from this loader) and you can also provide your custom adapter to support a new engine (in which case, we welcome PRs!)

#### [`sharp`](https://github.com/lovell/sharp) (conversion | resolution switching)

Everything should "Just Work™" out-of-the-box. It's installed by default when adding the loader dependency, but check for [`libvips` dependency](https://sharp.pixelplumbing.com/en/stable/install/#libvips) if something doesn't work properly. If you get build errors at the first run, try deleting and re-installing the whole `node_modules` folder.

#### [`thumbor`](https://github.com/thumbor/thumbor) (art direction)

First setup Docker on your system:

- [Linux](https://docs.docker.com/engine/install/ubuntu/) (we suggest to use ["rootless" mode](https://docs.docker.com/engine/security/rootless))
- [Windows](https://docs.docker.com/docker-for-windows/install/)
- [Mac](https://docs.docker.com/docker-for-mac/install/)

Then pull [docker Thumbor image](https://github.com/MinimalCompact/thumbor) running `docker pull minimalcompact/thumbor`.

This engine ships with a preset configuration.

Due to its nature of spawning a brand new container for every build cycle, using `thumbor` will not leverage Thumbor builtcache mechanism, meaning build time will not decrease on subsequent runs.

## <span id="usage"></span> Usage

### On `<img>` tags

Add `responsive` attribute over an `<img>` component and it will be enhanced with conversion and resolution switching!

```html
<img responsive src="my-little-calogero.jpg" />
```

By default all classes on `<img>` will also be copied over to the wrapping `<picture>`.
If you want to change classes which are applied to `<img>` after the rewrite took place, you can use `responsive-img-class` attribute.
If you want to manually specify which classes should be applied to `<picture>`, you can use `responsive-picture-class` attribute.
If you add either `responsive-img-class` or `responsive-picture-class` without any value or with an empty value, classes on `<img>` and `<picture>` will be erased.

```html
<img class="hello there" responsive src="my-little-calogero.jpg" />

<!-- WILL BECOME -->

<picture class="hello there">
  <source />
  <source />
  <!-- ... -->
  <img class="hello there" responsive src="something.jpg" />
</picture>
```

```html
<img
  class="hello there"
  responsive
  responsive-img-class="master kenobi"
  src="my-little-calogero.jpg"
/>

<!-- WILL BECOME -->

<picture class="hello there">
  <source />
  <source />
  <!-- ... -->
  <img class="master kenobi" responsive src="something.jpg" />
</picture>
```

```html
<img
  class="hello there"
  responsive
  responsive-img-class
  src="my-little-calogero.jpg"
/>

<!-- WILL BECOME -->

<picture class="hello there">
  <source />
  <source />
  <!-- ... -->
  <img responsive src="something.jpg" />
</picture>
```

You can opt-in to art direction adding `responsive-ad` attribute. You can also provide an encoded inline transformation as the attribute value which will be merged on top of [default transformations](#default-transformations). \
This allow to overwrite size or ratio of an existing transformation on a single image.

The syntax for inline transformations is:

- it can contain one or more properties;
- each property definition starts with the property name (`ratio`, `path`, `size`, etc.) followed by an equality sign (`=`) and one or more options separated by a comma (`,`);
- every option is composed by a value and, optionally, one or more viewports to which it must be applied;
- wiewports must be enclosed into curly braces (`{}`) and separated by a pipe char (`|`).

Adding a `responsive-ad-ignore` attribute without value will disable all default transformations, while providing a pipe-separated list of transformation names will disable only the selected ones.

Notice that you can use both a viewport width or an [alias](#aliases) to reference a transformation in the value of both attributes.

```html
<!-- Opt-in to art direction -->
<img responsive responsive-ad src="my-little-nicola.jpg" />
<!--
  Define inline transformations:
  - the first uses a viewport width as name and explicitly define `ratio` and `size`.
  - the second uses an alias as name and define a custom image
    (it will be used "as-is"); `size` has not been specified and
    will be inferred from the default size.
-->
<img
  responsive="size=0.5{699}"
  responsive-ad="ratio=3:2{699};path=./custom_example.jpg{md}"
  src="my-little-francisco.jpg"
/>
<!--
  Define inline transformations:
  - on `xs` and `md` viewports the `size` is `0.5`, while it's `0.33` on `sm` one. All other viewports will use the default size.
  - on `xs` and `md` viewports the `ratio` is `1:2`, while it's `3:2` on `sm` one. All other viewports will use the default ratio (which is the original image ratio).
-->
<img
  responsive="size=0.33{sm},0.5{xs|md}"
  responsive-ad="ratio=3:2{sm},1:2{xs|md}"
  src="my-little-francisco.jpg"
/>
<!--
  Ignore all default transformations and only apply the one specified.
-->
<img
  responsive-ad-ignore
  responsive-ad="ratio=2:3{1023}"
  src="my-little-kappa.jpg"
/>
<!-- Ignore only 'xs' and '1500' transformations, apply all other default ones -->
<img
  responsive
  responsive-ad-ignore="xs|1500"
  responsive-ad
  src="my-little-cuenta.jpg"
/>
```

### On `background-image` CSS rules

Add `responsive` and `responsive-bg` attributes on any tag whose `background-image` you want to manage. The latter should be initialized to the path of the source image.

```html
<div class="enhanced-bg-div" responsive responsive-bg="my-little-calogero.jpg">
  <p>Hey there, I'm famous</p>
</div>
```

All conversion, resolution switching and art direction options apply with the same API as if they were used on an `<img>` tag.

To keep the same GUI both in development and production mode you should add a fallback `background-image` CSS rule (usually with the same value as `responsive-bg` attribute) which conditionally target the element when the loader is not applied. A `data-responsive-bg` attribute is added to every enhanced element for this reason.

```css
.enhanced-bg-div:not([data-responsive-bg]) {
  background-image: url(my-little-calogero.jpg);
}
```

Adding a fallback without the `:not([data-responsive-bg])` selector will cause the browser to load the un-optimized image anyway, causing harm instead of benefit.

## <span id="configuration"></span> Configuration

You can check out the default configuration [here](defaults.ts).

```typescript
// Full configuration, you won't ever need all this options
const fullOptionsExample: ResponsiveImagePluginConfig = {
  defaultSize: 1.0,
  viewportAliases: {
    xs: '699', // 0-699
    md: '1439', // 700-1439
  },
  paths: {
    outputDir: '/images/',
    aliases: {
      '@randomjapp': 'src',
      /* ... */
    },
  },
  conversion: {
    converter: 'sharp',
    enabledFormats: {
      webp: true,
      jpg: true,
    },
  },
  resolutionSwitching: {
    resizer: 'sharp',
    breakpoints: {
      minViewport: 200,
      maxViewport: 3840,
      maxSteps: 5,
      minStepSize: 35,
    },
  },
  artDirection: {
    transformer: 'thumbor',
    defaultRatio: 'original',
    defaultTransformations: {
      xs: { ratio: '4:3' },
      md: { ratio: '2:3', size: 0.5 },
    },
  },
};

// Example of a typical configuration, if using art direction
const options: DeepPartial<ResponsiveImagePluginConfig> = {
  viewportAliases: {
    xs: '699', // 0-699
    sm: '1023', // 700-1023
    md: '1439', // 1024-1439
    lg: '1919', // 1440-1919
    xl: '3400', // 1920-3400
  },
  paths: {
    outputDir: '/img/',
    aliases: {
      '~': 'src/',
    },
  },
  artDirection: {
    transformer: 'thumbor',
    defaultTransformations: {
      xs: { ratio: '4:3' },
      sm: { ratio: '2:1' },
      md: { ratio: '2:3' },
      lg: { ratio: '16:9' },
      xl: { ratio: '21:9' },
    },
  },
};
```

### <span id="global-configuration"></span> Global configuration

#### <span id="aliases"></span>`viewportAliases` (default: {})

Maps of aliases to viewport widths which is used when specifying different sizes for resolution switching or when referencing a transformation.

```typescript
const opts = {
  viewportAliases: {
    xs: '699', // 0-699
    sm: '1023', // 700-1023
    md: '1439', // 1201-1439
    lg: '1919', // 1440-1919
    xl: '3400', // 1920-3400
  },
};
```

#### `defaultSize` (default: 1.0);

Will be used when applying transformations or creating resolution switching breakpoints.
If provided as a percentage (`size <= 1.00`) it's considered as the width size multiplier with respect to the maxViewport.
If provided as a number bigger than `300` it's considered as the width in pixels.
Value is capped to `0.10` on lower bound.

### <span id="paths"></span> Paths

#### `outputDir` (default: '/')

Specify a folder which will prefix images uri emitted by this loader.
Your production bundle probably isn't organized with a flat folder structure, so you'll want to use this options most of the time.

```typescript
// All images will be emitted into the bundle `img` folder
const opt = { outputDir: '/img/' };
```

#### `aliases` (default: {})

Specify a map of aliases which is used to correctly resolve source image paths. Most of the times this will match your webpack aliases map (we still don't know how to programmatically get those ones, we welcome PRs!).

In case of multiple matches, the first one win.

```typescript
// Make `~` point to `src/` folder
const opt = { aliases: { '~': 'src/' } };
```

### <span id="conversion"></span> Conversion

#### `converter` (default: 'sharp')

Specify the adapter function to use for image format conversion.
You can provide the name of a preset adapter (only `sharp` for now) **after you [installed it](#engines) properly on your system**.
Providing `null` disables conversion.

**The adapter cannot be a lambda function, or it won't inherit the loader context**

```typescript
// Disables conversion
const opt = { converter: null };

// Provide custom adapter, **never use a lambda function**
const opt = {
  converter: function (sourcePath, destinationPath, uriWithoutHash, format) {
    /**/
    return breakpoint;
  },
};

// Provide custom adapter defined elsewere, **never use a lambda function**
const conversionAdapter: ConversionAdapter = function (
  sourcePath,
  destinationPath,
  uriWithoutHash,
  format,
) {
  /**/
  return breakpoint;
};
const opt = { converter: conversionAdapter };
```

#### `enabledFormats` (default: jpg and webp enabled)

Keys of this object represents available formats (`jpg` or `webp`), while their value represent their enabled status.

```typescript
// Only serve webp formats
const opt = { enabledFormats: { webp: true, jpg: false } };
```

Source will be ordered by format efficiency: `webp` > `jpg`

### <span id="resolution-switching"></span> Resolution switching

Breakpoints generation adds as many breakpoints as possible into narrow viewports (smartphones), which suffer high bundle sizes the most (eg. when using data network); it also grants some breakpoints to wider viewports (laptops, desktops), where is less critical to save bandwidth.
If narrow viewports need less breakpoints than originally allocated for them, those breakpoints are re-allocated to wider viewports and removed when they cannot be used in the widest viewport available.

#### `resizer` (default: 'sharp')

Specify the adapter to use for image resizing.
You can provide the name of a preset adapter (only `sharp` for now) **after you [installed it](#engines) properly on your system**.
Providing `null` disables resolution switching.

**The adapter cannot be a lambda function, or it won't inherit the loader context**

```typescript
// Disables resolution switching
const opt = { resizer: null };

// Provide custom adapter, **never use a lambda function**
const opt = {
  resizer: function (sourcePath, destinationPath, breakpointWidth) {
    /**/
    return breakpoint;
  },
};

// Provide custom adapter defined elsewere, **never use a lambda function**
const resizingAdapter: ResizingAdapter = function (
  sourcePath,
  destinationPath,
  breakpointWidth,
) {
  /**/
  return breakpoint;
};
const opt = { resizer: resizingAdapter };
```

#### `minViewport` (default: 200)

The minimum viewport which will be considered when automatically generating breakpoints.

#### `maxViewport` (default: 3840)

The maximum viewport which will be considered when automatically generating breakpoints.

#### `maxBreakpointsCount` (default: 5)

Maximum number of breakpoints which can be generated, the actual count can be lower due to `minSizeDifference` option.
It doesn't include breakpoints generated by art direction transformations.

#### `minSizeDifference` (default: 35)

Minimum size difference (expressed in KB) there should be between a breakpoint and both its preceding and following ones.

### <span id="art-direction"></span> Art direction

#### `transformer` (default: null)

Specify the adapter to use for image transformations.
You can provide the name of a preset adapter **after you [installed it](#engines) properly on your system**.
Providing `null` disables art direction.

**The adapter cannot be a lambda function, or it won't inherit the loader context**

```typescript
// Disables art direction
const opt = { transformer: null };

// Provide custom adapter, **never use a lambda function**
const opt = {
  transformer: function (imagePath, transformations) {
    /**/
    return transformationSource;
  },
};

// Provide custom adapter defined elsewere, **never use a lambda function**
const transformationAdapter: TransformationAdapter = function (
  imagePath,
  transformations,
) {
  /**/
  return transformationSource;
};
const opt = { transformer: transformationAdapter };
```

#### `defaultRatio` (default: 'original');

The ratio which will be used when applying transformations, if not explicitly provided.

#### `defaultTransformations` (default: {});

Map of default transformations.

```typescript
const opts = {
  defaultTransformations: {
    xs: { ratio: '4:3' },
    sm: { ratio: '2:1' },
    md: { ratio: '2:3' },
    lg: { ratio: '16:9' },
    xl: { ratio: '21:9' },
  },
};
```

## <span id="caveats-faq"></span> Caveats & FAQ

### Does it work in every possible scenario?

**NO!**
Being a webpack loader, it has limits derived by being a build-time tool: it will only work for images statically referenced in your code.
If you are dynamically changing your `<img>` `src` attribute, this loader cannot help you. If you are doing so with a JS framework via dynamic bindings (Vue `:src="..."`, Angular `[src]="..."`, etc), changing your component to use slots instead could help you and make your components more flexible.

### Only use in production and/or with webpack 'filesystem' cache enabled

The compilation time overhead of this loader is REALLY high, due to image processing. It is not advisable to use it during development unless you have a really valid motivation to do so. You'll probably want to apply it conditionally to your webpack chain only when building for production.

```javascript
if (process.env.NODE_ENV === "production") {
    webpackConfig.module.rules.push({ ... });
}
```

Since Webpack 5 comes with a build-in cache system, you can leverage it to skip image generation step after the first run.
This may allow you to also use the loader when in dev mode, even tho the loader will still execute (and thus re-generate images) if you change a file containing an image tagged as responsive, resulting in an extremely slow HMR.

> Note this could actually be avoided by adding a loader-level cache mechanism skipping execution if the hash of image and options hasn't changed, but we haven't had the time to implement this. Any help is appreciated, and it will allow to use this loader in dev mode

```javascript
webpackConfig.cache.type = 'filesystem';
```

### Why do I get `TypeError: Cannot read property 'replace' of undefined` when building?

It means this loader is applied by Webpack, but it doesn't return anything to the next loader. It usually happens when you use `thumbor` transformer, but you forgot to start the docker daemon.

### Execution into Node environment

When executed into Node environment (eg. when building for Quasar SSR mode) and using `responsive-bg` feature, the compilation could break and throw one of these two errors:

1. `Conflict: Multiple chunks emit assets to the same filename server-bundle.js`

   Using multiple Webpack `entry` points, as we do to register the handler, and compiling client and server bundles with the same Webpack process, the `responsive-bg-image-handler` will be registered two times, triggering a naming conflict.

1. `ReferenceError: window is not defined`

   This error is thrown when the loader tries to register the handler into the global `window` object, as it isn't available in the Node environment.

The handler is only useful at runtime on the client, the solution to both these problems is to include the handler registration only on the client webpack configuration.

When talking about Quasar SSR mode, this means you should use `isClient` SSR flag into the second parameter of `extendWebpack`.

```js
extendWebpack(webpackConfig, { isClient }) {
  // ... other configurations

  if (isClient) {
    webpackConfig.entry['responsive-bg-image-handler'] =
      '@dreamonkey/responsive-image-loader';
  }
},
```

### Pay attention to CSS selectors

`<img>` will be wrapped into a `<picture>` when the loader kicks in.
Use a class to reference the image in your selectors and avoid direct-descendent selector.
Check out class management into the [Usage](#usage) section.

```html
<div class="container">
  <img
    class="positioning-class"
    responsive
    responsive-img-class="inner-image-class"
    src="something.jpg"
  />

  <img class="my-image" responsive src="something.jpg" />
</div>
```

will become

```html
<div class="container">
  <picture class="positioning-class">
    <source />
    <source />
    <!-- ... -->
    <img class="inner-image-class" responsive src="something.jpg" />
  </picture>

  <picture class="my-image">
    <source />
    <source />
    <!-- ... -->
    <img class="my-image" responsive src="something.jpg" />
  </picture>
</div>
```

so the selector should take into accout both structures, depending on the context

```css
/* Should access direct child, whoever it is (eg. positioning or spacing) */
/* (preferred) */
.positioning-class {
  /* ... */
}

/* Or */
.container > img,
.container > picture {
  /* ... */
}

/* Should access original image tag */
/* (preferred) */
.inner-image-class {
  /* ... */
}

/* Or */
/* (preferred) */
.container .my-image {
  /* ... */
}

/* Or */
.container img {
  /* ... */
}

/* Or */
.container > img,
.container > picture > img {
  /* ... */
}
```

### The image I provided for the custom transformation isn't working...

Custom transformation images' path currently cannot contain `_` or `:` characters, check if your does and if it's the case update the file name!

### How do I enable/disable conversion and/or resolution switching?

Conversion and resolution-switching are enabled by default.
If you want to disable them globally, set `conversion.converter` and/or `resolutionSwitching.resizer` to `null` into the loader options.
Currently there is no way to disable them on a per-image basis.

### Which default value should I use for `defaultSize`?

`defaultSize`, which is a global configuration option, will be used both for art direction and resolution switching. In the latter case, it is used in particular when:

- a breakpoint is generated after the last art direction source;
- there are no art direction sources at all.

Because of this, you should set `defaultSize` to be the one of the image on the biggest screen possible.

Example: if the image occupies 100% of the viewport width on the maximum supported width of my website, default `size` will be `1.0`. If it occupies 50%, default `size` will be `0.5`.

### Why doesn't the loader kick in on my images?

The loader won't process the image if `responsive` attribute is missing or if `src` attribute is missing or empty. Also, art direction won't take place if `responsive-ad` is missing.

### The fallback background image is downloaded anyway even when `responsive-bg` is active

You must manually prevent the fallback background-image CSS rule from being applied when the loader kicks in.
Remember to wrap it into a `:not([data-responsive-bg])` selector!

### My child-referencing CSS selectors break when I use the background-image optimization feature

Due to poor flexibility of [`image-set()`](https://developer.mozilla.org/en-US/docs/Web/CSS/image-set) CSS function (HTML `srcset` attribute counterpart), background images management exploits the same HTML features used for `<img>` tags.

An hidden `<picture>` element, whose purpose is to detect the best image to use, is added as the first child of the enhanced element. This could break CSS cardinality selectors like `:first-child`, `:first-of-type` and `:nth-child`.

The enhanced element `background-image` property is updated via a globally available JavaScript handler every time the `<picture>` inner `<img>` element loads a new image.

```html
<div class="enhanced-bg-div" responsive responsive-bg="my-little-calogero.jpg">
  <p>Hey there, I'm famous</p>
</div>

<!-- WILL BECOME -->

<div
  class="enhanced-bg-div"
  responsive
  responsive-bg="my-little-calogero.jpg"
  data-responsive-bg
>
  <picture class="responsive-bg-holder">
    <source />
    <source />
    <!-- ... -->
    <img
      class="responsive-bg-holder"
      responsive
      src="my-little-calogero.jpg"
      style="display: none"
      onload="**handler invocation**"
    />
  </picture>
  <p>Hey there, I'm famous</p>
</div>
```

## <span id="contributing"></span> Contributing

Please see [CONTRIBUTING](CONTRIBUTING.md) for details.

## <span id="security"></span> Security

If you discover any security related issues, please email security@dreamonkey.com instead of using the issue tracker.

## <span id="license"></span> License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.

<!--
  TODO: We're stuck to use lodash as TS won't transpile non-TS files and we don't want to add Babel too.
  Same reason why we cannot use absolute paths with TS mappings, TS won't transform them and we're not processing
  those files via webpack or Babel
-->

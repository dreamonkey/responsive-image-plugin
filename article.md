## What's this about?

## From where I started

Image generation already working, but descriptors generation and assets generation were coupled
Everything managed into the loader
Generated images were put in as files emitted by the loader, plugged off from all other loaders operations (no hash, no automatic loading, etc)
I already have some smoke tests in place, which allowed me to quickly validate the actual output

## Objectives

Use size estimates for resizing to speedup generation
Decouple descriptors generation and image generation
Learn how plugins work
Understand how we can update a module source code after

## What have I learnt?

Entry points usually generate one chunk (multiple, if there are dynamic imports around)
Each chunk contains modules. Some modules have source code, but many others (eg. ) don't.
A particular type of Module is AssetModule (new in webpack 5), which is meant to manage OOB static assets (images/font/etc)

The whole webpack process is tapable/hookable, but some hooks are only sync, while others can be async and thus used to do heavy tasks.
Using TS and async/await you'll probably always go with `tapPromise` when using an async hook.

The standard module is called NormalModule the thing which provides the loader context. It provides its own hooks via `NormalModule.getCompilationHooks(compilation)`, but I haven't figured it out if those can help us or not.
Some seemingly promising hooks could be `loader`, `beforeLoaders`, `beforeParse`, but they're all sync, so we cannot used them to generate images.

How to create a plugin
See https://survivejs.com/webpack/extending/plugins/
See https://www.digitalocean.com/community/tutorials/js-create-custom-webpack-plugin
see

Which are the hooks and in which order they are (usually) executed
See https://webpack.js.org/api/compilation-hooks/

Most of the times you'll want to tap into `thisCompilation`.
I tried using `compilation.hooks.processAssets` to do the optimization, especially the ones at stage `Compilation.PROCESS_ASSETS_STAGE_DERIVED` (art direction), `Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE` (resolution switching) and `Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_COMPATIBILITY` (conversion).
Unluckily, it seems that "optimization" cannot include generating new assets and referencing them from the source code for webpack guys.
Some other promising hooks which I didn't try out were `additionalAssets` and `optmizeAssets`.
I tried to tap into `compiler.hooks.done` and `compilation.hooks.afterProcessAssets` to tamper with the source code at the end of the compilation, obtaining the final code directly with `stats.compilation.options.output`, reading it via Node, adding back the correct assets paths and writing it back, but my tests were unsuccessful.
Also, hashes would not reflect the source content anymore

Webpack is really complex and with minimal or no docs
Every piece of code is a Module
Static stuff (font/images/etc) we create around are Assets

Options can be shared by plugin and loader just by using an ESM module variable as a store, filling it from the plugin and using it into the loader.

`this.addBuildDependency` is used to define the dependencies which are only related to the build process itself, eg webpack

`this.emitFile(name, content)` (loader) is roughly the same as `compilation.emitAsset(name, new RawSource(content))` (plugin). The latter is only an helper which adds the source into `compilation.assets`

`compilation.updateAsset` may be useful too, but only if you need to replace an asset "in place" I guess

`this.addDepencency(path)` and co (loader) are roughly the same as `compilation.fileDependencies.add(path)` (plugin)
`this._module` and `this._compilation` are "deprecated" and "should not be used". But many use cases are literally not feasible without them

Loading an html file directly as entry point with html-loader isn't possible
html-loader converts an html file to a JS module, converting which imports the assets
It should be possible using https://webpack.js.org/loaders/html-loader/#export-into-html-files
But I haven't tried it

Updating the source via private properties seem to work in simple cases (`module._source._value`), but breaks on more complex ones. It's a dirty hack anyway.
`module.source(compilation.dependencyTemplates,compilation.runtimeTemplate).source()` is deprecated and doesn't seem to work anymore

It's possible to register a loader automatically via a plugin using `compiler.options.module.rules.push(loaderConfig)`
We didn't do that as our plugin may target Vue files too. We could either add support both for html and vue, or just leave it to the user. Not sure which to choose

The best way to update the source code of a module is to execute the loader a first time doing nothing (or doing intermediate processing), do your stuff into the plugin, then trigger a `rebuildModule` on the modules which must be updated into `finishModules`, `seal` or `optimizeModules` hooks. The latter 2 are guaranteed to have all compilation context loaded, thus they may be useful. The loader will be executed again (together with all other loaders on the same module I guess) and you can then finish processing the file with the new data provided by the plugin (stored into a shared ESM module export, into `this._compilation` or `this._module`).
Note that triggering `rebuildModule` is probably pretty inefficient and could cause performance loss.
See https://github.com/webpack/webpack/issues/8830#issuecomment-580095801
A problem with this way is that you then need to WAIT for the `rebuildModule` to finish, and it isn't promise-like by default.
If you don't wait, compilation will go on and changes to rebuild modules will be lost or, worse, cause some kind of undebuggable mismatch.
At `finishModules` stage, `module.getSourceTypes().has('javascript')` and `!!(module as any)._source._value` are the same, but later on (eg. at `done` stage) this isn't true anymore

We managed to find a way to estimate the file size by width and height, or width and ratio
See https://pixelcalculator.com/en
Unluckily this doesn't take into consideration the compression when determining viewport breakpoints (eg. webp are 30% more efficient than JPG, this should probably be taken into consideration)

Node `format` will add a double slash on its output then `dir` is equal to `/` (which is the default value of `root`).
This is on purpose, but pretty strange
See https://github.com/nodejs/node/issues/22030

We can wait the promisified `exec` with `docker container stop xxx` to be sure the container actually died.

Since we moved to a plugin, options can now be typechecked and intellisense works there.

There are multiple "resolvers" into webpack, which are created using "enhanced-resolve": https://webpack.js.org/api/resolvers/
You can access webpack aliases from loaders using `this._compiler.resolverFactory.get('normal').options.alias`, as resolvers are guaranteed to be initialized when loaders are run.
The same doesn't hold true into plugin `apply`, as at that stage they aren't initialized, but you can access them tapping into resolverFactory hooks: `compiler.resolverFactory.hooks.resolver.for('normal').tap(this.pluginName, (resolver) => { /* ah-ah business */ });`

Use `compiler.getInfrastructureLogger(this.pluginName)` into plugins to get a logger which prints directly in the console.
`compilation.getLogger(this.pluginName)` (plugin) and `this.getLogger('loader-name')` (loader) log stuff into the internal stats webpack object and aren't printed at screen.
You can change the logging level via `stats.logging` or `infrastructureLogging.level` into webpack config
See https://github.com/webpack/webpack.js.org/issues/3205

## Future developments

Study unplugin and try to make the plugin work with Vite too
See https://github.com/unjs/unplugin

We'll probably need to support AVIF format in the future, as well as accept PNG images
https://web.dev/uses-webp-images/

`WebpackLogger` types isn't exported, we probably should tell webpack guys to export it

## Open questions

We should add a metadata cache to avoid the whole process if the configuration is still the same, together with a dry run option, which prevents generation into the server.
Even if, given performances improved this much, this may not be needed.

We should create the temp folder when starting the plugin and remove it when it finishes, if temp images aren't used anymore.
If there's a way to access assets directly to power transformation/resizing/conversion, we should stop writing temp files to disk

What should `this.addMissingDependency` be used for? There's no docs whatsoever. Only mention: `webpack/lib/InvalidDependenciesModuleWarning.js`
Is `this.addDependency` only used to detect changes when doing HMR? It doesn't seem to add anything to assets, as `this.emitFile` does

Do `compilation.emitAsset` add the assets to the cache too?

Is there a legit way to update source code from compilation, outside loaders?
Relevant: https://stackoverflow.com/questions/35092183/webpack-plugin-how-can-i-modify-and-re-parse-a-module-after-compilation

Why wasn't `this._compiler.resolverFactory.get('normal').resolveSync({}, loaderContext.context, imagePath)` working, not even firing the console.log?

How do this stuff interact with the cache system? The cache is accessible via `compiler.cache` and similar properties.

We can enhance reporting for each step, eg. with https://webpack.js.org/api/plugins/#reporting-progress

How do `compilation.codeGenerationResults.getSource()` work? Can it be used to avoid rebuilding the whole module? What's the correct way to access a module source?

`module.getSourceTypes().has('javascript')` is this the correct way to filter out all modules without an actual source?

## Breaking changes/migration

Webpack aliases are automatically collected, `paths.aliases` has been removed and `paths.outputDir` has been moved one level up, now it's only `outputDir`
Setup changed, options must be provided to the plugin now: TODO: add example

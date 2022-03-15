# Changelog

## 0.6.0

- Chore: update deps
- Refactor: replace unmaintained `request` with `got` into `thumbor-docker` transformer
- Refactor: remove old `thumbor` transformer implementation, rename `thumbor-docker` to `thumbor`

## 0.5.0

- Feat: add background images fallback hook for SSR/SSG builds

## 0.4.2

- Chore: update deps
- Docs: explain usage when executed into Node environment (eg. Quasar SSR)

## 0.4.1

- Docs: fix changelog
- Fix: allow usage on every OS

## 0.4.0

- Chore: update deps
- Feat: add `thumbor-docker` transformer
- Chore: deprecate `thumbor` transformer
- Feat: support Windows and Mac using docker to run Thumbor

## 0.3.3

- Chore: update deps
- Fix: correctly throw when property options are malformed
- Docs: clarify usage of properties with multiple options and viewports
- Tests(parsing): cover properties/options/viewports parsing

## 0.3.2

- Chore: update deps

## 0.3.1

- Feat: make `background-image` optimization support web components slots systems

## 0.3.0

- Feat: support `background-image` optimization

## 0.2.0

- Fix: avoid `sizes="NaNvm"` when AD is disabled and RS is enabled
- Feat: move aliases and size management to global level, change properties syntax
- Feat: allow size as absolute value in pixels
- Perf(RS): avoid processing intervals where source images are too small

## 0.1.5

- Fix: 'path' option is now correctly taken into consideration

## 0.1.4

- Feat: loose up class management RegExps

## 0.1.3

- Feat: class management on enhanced `<img>`s and wrapping `<picture>`

## 0.1.2

- First stable release

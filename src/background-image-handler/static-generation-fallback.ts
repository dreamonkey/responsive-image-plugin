// SSR/SSG build steps usually move all scripts to the end of the body
// and mark them with "defer" to avoid render blocking,
// as the HTML should be ready as generated from the server.
// This handler gets deferred too, missing the first "onload" event of the images
// When the handler is first loaded, to cover that edge case, we search for
// instances of responsive background images where the backgroundImage proterty has not
// been set yet and manually execute what usually is fired by the image onload event
document
  .querySelectorAll<HTMLElement>('[data-responsive-bg]')
  .forEach((parent) => {
    if (!parent.style.backgroundImage) {
      const target = parent.querySelector<HTMLImageElement>(
        'img.responsive-bg-holder',
      );

      if (target?.currentSrc) {
        const currentSrc = new URL(target.currentSrc).pathname;
        parent.style.backgroundImage = `url(${currentSrc})`;
      }
    }
  });

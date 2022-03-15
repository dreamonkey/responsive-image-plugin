export default function responsiveBgImageHandler(event: Event): void {
  const target = event.currentTarget as HTMLImageElement;
  // We use `closest` instead of `parentElement.parentElement`
  //  to take into account web components scoping and slots management
  //  which could rearrange the position of the `<picture>` element
  const parent = target.closest<HTMLElement>('[data-responsive-bg]');
  const currentSrc = new URL(target.currentSrc).pathname;

  if (parent) {
    parent.style.backgroundImage = `url(${currentSrc})`;
  }
}

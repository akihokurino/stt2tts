export const isSafari = (): boolean => {
  const userAgent = window.navigator.userAgent;
  const isChrome = /Chrome/.test(userAgent);
  const isSafari = /Safari/.test(userAgent);

  return isSafari && !isChrome;
};

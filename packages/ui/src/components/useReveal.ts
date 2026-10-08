import { useEffect, useRef } from 'react';
// Scroll-in reveal for [data-reveal] descendants. Content is only hidden once JS has
// opted in (class on the root), so no-JS, jsdom and reduced-motion users see it at once.
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (
      !root ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    root.classList.add('reveal-ready');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    );
    const watch = () =>
      root
        .querySelectorAll('[data-reveal]:not(.is-revealed)')
        .forEach((el) => observer.observe(el));
    watch();
    // Data-driven sections (ligas, marcas) mount after the program query resolves.
    const mutations = new MutationObserver(watch);
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      root.classList.remove('reveal-ready');
    };
  }, []);
  return ref;
}

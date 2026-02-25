import { useCallback } from 'react';

export const useScrollToTop = () => {
  const scrollToTop = useCallback((behavior = 'smooth') => {
    window.scrollTo({ top: 0, behavior });
  }, []);

  return scrollToTop;
};
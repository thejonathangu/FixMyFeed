import { useEffect, useRef, useState } from 'react';

export function useCountUp(end: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const displayRef = useRef(0);

  useEffect(() => {
    fromRef.current = displayRef.current;
    let startTime: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - t) ** 3;
      const v = fromRef.current + (end - fromRef.current) * eased;
      const next = Math.round(v);
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return display;
}

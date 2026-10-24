import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { EASE_OUT } from "../motion";

type Props = { value: number; decimals?: number; suffix?: string; duration?: number };

/** F3 数字滚动: a number runs up to its value, slowing as it arrives. */
export function CountUp({ value, decimals = 0, suffix = "", duration = 0.8 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = (v: number) => (el.textContent = `${v.toFixed(decimals)}${suffix}`);
    if (reduced) return void show(value);
    const controls = animate(0, value, { duration, ease: EASE_OUT, onUpdate: show });
    return () => controls.stop();
  }, [value, decimals, suffix, duration, reduced]);

  return (
    <span ref={ref} className="tabular-nums">
      {`${(0).toFixed(decimals)}${suffix}`}
    </span>
  );
}

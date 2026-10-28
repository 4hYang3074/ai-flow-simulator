// Shared motion tokens. Codes refer to the animation dictionary (动画词典).

/** C2 减速停下 Ease-out (power3.out): fast start, soft stop. Used for entrances. */
export const EASE_OUT = [0.215, 0.61, 0.355, 1] as const;

/** Successive fact extraction animations start 60 ms apart. */
export const MEMORY_EXTRACT_STAGGER = 0.06;

/** C3 加速离开 Ease-in (power3.in): used for exits, which run about half as long. */
export const EASE_IN = [0.55, 0.055, 0.675, 0.19] as const;

/** D5 摇头: a quick "no" for errors. */
export const SHAKE = {
  animate: { x: [0, -6, 6, -4, 4, 0] },
  transition: { duration: 0.4, ease: "easeInOut" as const },
};

export const DURATION = {
  enter: 0.45,
  exit: 0.25,
  /** B1 依次出现: gap between items in a list. */
  stagger: 0.06,
} as const;

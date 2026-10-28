import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /** Extra grid placement, e.g. spanning columns on a tablet. */
  className?: string;
  children: ReactNode;
};

export function Panel({ title, action, className = "", children }: Props) {
  return (
    // On a phone the panels stack, each with a fixed height that scrolls
    // inside, so a long chat never pushes the input or the workflow away.
    <section
      className={`relative flex h-[80svh] min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface md:h-auto md:min-h-0 ${className}`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <h2 className="text-sm font-semibold">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

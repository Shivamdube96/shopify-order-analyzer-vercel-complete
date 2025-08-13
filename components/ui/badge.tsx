import * as React from "react";
import clsx from "clsx";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-neutral-300 px-2 py-0.5 text-xs bg-neutral-50",
        className
      )}
      {...props}
    />
  );
}

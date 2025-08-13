import * as React from "react";
import clsx from "clsx";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "h-10 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm outline-none",
        "focus:ring-2 focus:ring-black/10 focus:border-neutral-400",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

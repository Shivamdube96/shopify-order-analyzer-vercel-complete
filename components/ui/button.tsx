import * as React from "react";
import clsx from "clsx";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost";
}
export function Button({ className, variant = "default", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-2xl text-sm font-medium px-3 py-2 transition border";
  const styles = {
    default: "bg-black text-white border-black hover:opacity-90",
    secondary: "bg-white text-black border-neutral-300 hover:bg-neutral-50",
    ghost: "bg-transparent border-transparent hover:bg-neutral-100",
  } as const;
  return <button className={clsx(base, styles[variant], className)} {...props} />;
}

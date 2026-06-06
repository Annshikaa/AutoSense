import clsx from "clsx";

export default function LoadingSpinner({ size = "md", className }) {
  const sz = { sm: "w-4 h-4 border-2", md: "w-6 h-6 border-2", lg: "w-10 h-10 border-[3px]" }[size];
  return (
    <span
      className={clsx(
        "inline-block rounded-full border-[#1e1e2e] border-t-[#3b82f6] animate-spin",
        sz,
        className,
      )}
    />
  );
}

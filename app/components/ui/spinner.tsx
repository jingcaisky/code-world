import { IconLoader2 } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof IconLoader2>) {
  return (
    <IconLoader2
      role="status"
      aria-label="加载中"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

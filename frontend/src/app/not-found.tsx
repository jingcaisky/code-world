import Link from "next/link";

import { Button } from "@/components/ui/button";
import { NotFoundBackButton } from "@/components/layout/not-found-back-button";
import { ROUTES } from "@/lib/constants";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-brand text-sm font-semibold tracking-wider uppercase">404</p>
      <h1 className="text-foreground mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        页面未找到
      </h1>
      <p className="text-muted-foreground mt-4">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link href={ROUTES.HOME}>Go home</Link>
        </Button>
        <NotFoundBackButton />
        <Button variant="secondary" asChild>
          <Link href={ROUTES.DASHBOARD}>控制台</Link>
        </Button>
      </div>
    </div>
  );
}

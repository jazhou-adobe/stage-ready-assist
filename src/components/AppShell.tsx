"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  LayoutDashboard,
  LifeBuoy,
  Presentation,
  Settings,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = {
  label: string;
  href: string;
  icon: IconType;
  disabled?: boolean;
  disabledTooltip?: string;
};

const FULLSCREEN_PREFIXES = ["/practice"];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRow({
  item,
  active,
}: {
  item: NavItem;
  active: boolean;
}) {
  const Icon = item.icon;
  const baseClasses =
    "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-0";
  const enabledClasses = active
    ? "bg-slate-800 text-white"
    : "text-slate-300 hover:bg-slate-800/60 hover:text-white";
  const disabledClasses =
    "cursor-not-allowed text-slate-500 opacity-60";

  if (item.disabled) {
    return (
      <span
        className={cn(baseClasses, disabledClasses)}
        title={item.disabledTooltip}
        aria-disabled="true"
        role="link"
        tabIndex={0}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(baseClasses, enabledClasses)}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);

  const script = useAppStore((s) => s.script);
  const result = useAppStore((s) => s.result);

  if (
    pathname &&
    FULLSCREEN_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  ) {
    return <>{children}</>;
  }

  const hasScript = script.trim().length > 0;
  const hasResult = result !== null;

  const primaryNav: NavItem[] = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    {
      label: "Studio Mode",
      href: "/practice",
      icon: Presentation,
      disabled: !hasScript,
      disabledTooltip: "Paste a script to start",
    },
    {
      label: "Analytics",
      href: "/report",
      icon: BarChart3,
      disabled: !hasResult,
      disabledTooltip: "Complete a session to view analytics",
    },
  ];

  const secondaryNav: NavItem[] = [
    { label: "Settings", href: "/settings", icon: Settings },
    { label: "Support", href: "/support", icon: LifeBuoy },
  ];

  return (
    <div className="flex min-h-screen flex-1 bg-slate-950 text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900">
        <div className="px-5 py-6">
          <div className="text-base font-bold tracking-tight text-white">
            PresentPro
          </div>
          <div className="text-xs text-slate-400">Professional Practice</div>
        </div>
        <nav
          aria-label="Primary"
          className="flex flex-col gap-1 px-3"
        >
          {primaryNav.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-slate-800 px-3 py-4">
          {secondaryNav.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
            />
          ))}
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col bg-slate-950 text-slate-100">
        {children}
      </main>
    </div>
  );
}

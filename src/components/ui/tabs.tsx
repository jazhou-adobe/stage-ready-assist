"use client";

import * as React from "react";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

export const Tabs = BaseTabs.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.List>,
  React.ComponentProps<typeof BaseTabs.List>
>(({ className, ...props }, ref) => (
  <BaseTabs.List
    ref={ref}
    className={cn(
      "relative inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.Tab>,
  React.ComponentProps<typeof BaseTabs.Tab>
>(({ className, ...props }, ref) => (
  <BaseTabs.Tab
    ref={ref}
    className={cn(
      "relative z-10 inline-flex items-center justify-center rounded-md px-4 py-1.5 text-sm font-medium text-slate-400 outline-none transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:ring-sky-400/60 data-[selected]:text-white",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsIndicator = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.Indicator>,
  React.ComponentProps<typeof BaseTabs.Indicator>
>(({ className, style, ...props }, ref) => (
  <BaseTabs.Indicator
    ref={ref}
    className={cn(
      "absolute inset-y-1 left-0 z-0 rounded-md bg-slate-800 transition-[transform,width] duration-200 ease-out",
      className,
    )}
    style={{
      transform: "translateX(var(--active-tab-left))",
      width: "var(--active-tab-width)",
      ...style,
    }}
    {...props}
  />
));
TabsIndicator.displayName = "TabsIndicator";

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof BaseTabs.Panel>,
  React.ComponentProps<typeof BaseTabs.Panel>
>(({ className, ...props }, ref) => (
  <BaseTabs.Panel
    ref={ref}
    className={cn("outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

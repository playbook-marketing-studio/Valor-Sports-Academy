import React from "react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { photoPosition } from "@/lib/photos";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="vtp-stripes relative min-h-screen flex items-center justify-center bg-background px-4 overflow-hidden">
      <img
        src="/images/photos/facility-wide.webp"
        alt=""
        width={1200}
        height={800}
        style={{ objectPosition: photoPosition("/images/photos/facility-wide.webp") }}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16] dark:opacity-[0.22]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />
      <ThemeToggle className="absolute right-3 top-3 z-10 bg-card/80 border border-border" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10 flex flex-col items-center">
          <div className="mb-6 flex justify-center"><Brand /></div>
          <h1 className="font-display text-3xl text-foreground inline-block">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.75)] border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}

import React from "react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="vtp-stripes relative min-h-screen flex items-center justify-center bg-background px-4">
      <ThemeToggle className="absolute right-3 top-3 bg-card/80 border border-border" />
      <div className="w-full max-w-md">
        <div className="text-center mb-10 flex flex-col items-center">
          <div className="mb-6 flex justify-center"><Brand /></div>
          <h1 className="font-display text-3xl text-foreground inline-block">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-[18px] shadow-[0_24px_70px_-30px_rgba(0,0,0,.75)] border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}

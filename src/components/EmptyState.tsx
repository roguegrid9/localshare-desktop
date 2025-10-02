// src/components/EmptyState.tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export default function EmptyState({ 
  icon, 
  title, 
  description, 
  actions 
}: EmptyStateProps) {
  return (
    <div className="h-full grid place-items-center text-white/60">
      <div className="text-center max-w-sm px-6">
        {icon && (
          <div className="text-4xl mb-4">{icon}</div>
        )}
        <div className="text-white/80 font-medium mb-2">{title}</div>
        <div className="text-white/50 text-sm mb-4">{description}</div>
        {actions && (
          <div className="mt-4">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

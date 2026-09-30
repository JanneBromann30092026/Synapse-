import { createElement } from 'react';
import { cn } from './cn';
import { projectColor, projectIcon } from './projectIcons';

export interface ProjectAvatarProps {
  color: string;
  icon?: string;
  /** Diameter in px. */
  size?: number;
  className?: string;
}

/** Round badge in the project color with the project icon (or a dot without icon). */
export function ProjectAvatar({ color, icon, size = 28, className }: ProjectAvatarProps) {
  const Icon = projectIcon(icon);
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full', className)}
      style={{
        width: size,
        height: size,
        background: projectColor(color, true),
        color: projectColor(color),
      }}
    >
      {Icon ? (
        // createElement: the icon is looked up from a static registry, not created during render.
        createElement(Icon, { size: Math.round(size * 0.55), 'aria-hidden': true })
      ) : (
        <span
          className="rounded-full"
          style={{ width: size * 0.36, height: size * 0.36, background: projectColor(color) }}
        />
      )}
    </span>
  );
}

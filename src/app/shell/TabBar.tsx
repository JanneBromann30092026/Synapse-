import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import { cn } from '@/components/ui';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { navItems } from './navItems';

/** Narrow layout (< 900 px: portrait, Split View): tab bar at the bottom. */
export function TabBar() {
  const devMode = useSettings((s) => s.devMode);
  return (
    <nav
      aria-label={de.nav.label}
      className="relative z-10 flex shrink-0 justify-center border-t border-line bg-surface/85 px-[max(0.5rem,env(safe-area-inset-left))] pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex w-full max-w-xl">
        {navItems(devMode).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'focus-ring no-callout flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium transition-colors',
                isActive ? 'text-accent' : 'text-fg-secondary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative flex h-8 w-14 items-center justify-center">
                  {isActive && (
                    <motion.span
                      layoutId="tab-active"
                      transition={spring.default}
                      className="absolute inset-0 rounded-full bg-accent-soft"
                    />
                  )}
                  <Icon size={22} aria-hidden className="relative" />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

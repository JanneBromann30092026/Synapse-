import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn, IconButton, ProjectAvatar, Tooltip } from '@/components/ui';
import { useProjects } from '@/features/projects/hooks';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { navItems } from './navItems';

const EXPANDED_WIDTH = 264;
const COLLAPSED_WIDTH = 84;
const iconUrl = `${import.meta.env.BASE_URL}icons/favicon.svg`;

function MaybeTooltip({
  show,
  content,
  children,
}: {
  show: boolean;
  content: string;
  children: React.ReactNode;
}) {
  return show ? <Tooltip content={content}>{children}</Tooltip> : <>{children}</>;
}

/** Wide layout (≥ 900 px): collapsible sidebar with navigation and project quick access. */
export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const devMode = useSettings((s) => s.devMode);
  const setSetting = useSettings((s) => s.set);
  const projects = useProjects();
  const visibleProjects = projects?.filter((project) => !project.archived) ?? [];

  const itemClass = (isActive: boolean) =>
    cn(
      'focus-ring no-callout relative flex min-h-11 items-center gap-3 rounded-full px-3.5 text-base font-medium transition-colors',
      isActive ? 'text-accent' : 'text-fg-secondary hover:text-fg',
      collapsed && 'justify-center px-0',
    );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={spring.default}
      className="relative z-10 flex h-full shrink-0 flex-col border-r border-line bg-surface/80 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
    >
      <div className={cn('flex items-center gap-3 px-4 pb-4', collapsed && 'flex-col px-0')}>
        <img
          src={iconUrl}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-md shadow-soft"
        />
        {!collapsed && (
          <span className="flex-1 text-lg font-semibold tracking-tight text-fg">{de.app.name}</span>
        )}
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? de.nav.expand : de.nav.collapse}
          onClick={() => void setSetting('sidebarCollapsed', !collapsed)}
        />
      </div>

      <nav aria-label={de.nav.label} className="flex flex-col gap-1 px-3">
        {navItems(devMode).map(({ to, label, icon: Icon }) => (
          <MaybeTooltip key={to} show={collapsed} content={label}>
            <NavLink
              to={to}
              className={({ isActive }) => cn(itemClass(isActive), collapsed && 'w-full')}
              aria-label={collapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-nav"
                      transition={spring.default}
                      className="absolute inset-0 rounded-full bg-accent-soft"
                    />
                  )}
                  <Icon size={22} aria-hidden className="relative shrink-0" />
                  {!collapsed && <span className="relative truncate">{label}</span>}
                </>
              )}
            </NavLink>
          </MaybeTooltip>
        ))}
      </nav>

      <section className="mt-6 flex min-h-0 flex-1 flex-col px-3">
        {!collapsed && (
          <h2 className="px-3.5 pb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {de.nav.quickAccess}
          </h2>
        )}
        <div className="scroll-area flex flex-col gap-1">
          {visibleProjects.length === 0 && !collapsed && (
            <p className="px-3.5 text-sm text-fg-muted">{de.nav.noProjects}</p>
          )}
          {visibleProjects.map((project) => {
            return (
              <MaybeTooltip key={project.id} show={collapsed} content={project.name}>
                <NavLink
                  to={`/projects/${project.id}`}
                  className={({ isActive }) =>
                    cn(itemClass(isActive), 'text-sm', collapsed && 'w-full')
                  }
                  aria-label={collapsed ? project.name : undefined}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="sidebar-project"
                          transition={spring.default}
                          className="absolute inset-0 rounded-full bg-surface-sunken"
                        />
                      )}
                      <ProjectAvatar
                        color={project.color}
                        icon={project.icon}
                        className="relative"
                      />
                      {!collapsed && (
                        <span className={cn('relative truncate', isActive && 'text-fg')}>
                          {project.name}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              </MaybeTooltip>
            );
          })}
        </div>
      </section>
    </motion.aside>
  );
}

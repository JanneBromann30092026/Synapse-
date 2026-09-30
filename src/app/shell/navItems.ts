import {
  Brain,
  ChartNoAxesColumn,
  FolderKanban,
  Settings,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { de } from '@/i18n/de';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function navItems(devMode: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/projects', label: de.nav.projects, icon: FolderKanban },
    { to: '/brain', label: de.nav.brain, icon: Brain },
    { to: '/stats', label: de.nav.stats, icon: ChartNoAxesColumn },
    { to: '/settings', label: de.nav.settings, icon: Settings },
  ];
  if (devMode) items.push({ to: '/dev/ui', label: de.nav.dev, icon: Wrench });
  return items;
}

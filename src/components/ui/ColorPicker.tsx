import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { PROJECT_COLORS, type ProjectColor } from '@/data/types';
import { de } from '@/i18n/de';
import { spring, TAP_SCALE } from '@/styles/motion';
import { cn } from './cn';
import { projectColor } from './projectIcons';

export interface ColorPickerProps {
  value: ProjectColor;
  onChange: (color: ProjectColor) => void;
  label?: string;
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  label = de.ui.colorPicker,
  className,
}: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {PROJECT_COLORS.map((color) => {
        const selected = color === value;
        return (
          <motion.button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={de.ui.colors[color]}
            title={de.ui.colors[color]}
            onClick={() => onChange(color)}
            whileTap={{ scale: TAP_SCALE }}
            transition={spring.snappy}
            className="focus-ring no-callout flex size-11 items-center justify-center rounded-full"
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-full transition-shadow',
                selected && 'ring-2 ring-offset-2 ring-offset-surface',
              )}
              style={{
                background: projectColor(color),
                ['--tw-ring-color' as string]: projectColor(color),
              }}
            >
              {selected && <Check size={18} strokeWidth={3} className="text-white" aria-hidden />}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

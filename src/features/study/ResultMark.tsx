import { useState } from 'react';
import { motion } from 'motion/react';
import { burstParticles } from '@/core/study/presentation';
import type { Verdict } from '@/data/types';
import { de } from '@/i18n/de';

const PARTICLE_COLORS = ['var(--success)', '#34d399', '#a7f3d0'];

/** Round badge on the card edge: the check or X draws itself; right answers burst particles. */
export function ResultMark({ verdict, reduced }: { verdict: Verdict; reduced: boolean }) {
  const correct = verdict === 'correct';
  const [particles] = useState(() => (correct && !reduced ? burstParticles(12, Math.random) : []));
  const [burstDone, setBurstDone] = useState(false);
  const draw = reduced
    ? { initial: false as const }
    : {
        initial: { pathLength: 0 },
        animate: { pathLength: 1 },
        transition: { duration: 0.35, delay: 0.25, ease: 'easeOut' as const },
      };

  return (
    <div
      className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
      data-testid="study-result"
      data-verdict={verdict}
    >
      {!burstDone &&
        particles.map((particle, index) => (
          <motion.span
            key={particle.id}
            aria-hidden
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: particle.size,
              height: particle.size,
              marginLeft: -particle.size / 2,
              marginTop: -particle.size / 2,
              background: PARTICLE_COLORS[particle.tone],
            }}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{ x: particle.x, y: particle.y, scale: 1, opacity: 0 }}
            transition={{ duration: 0.75, delay: 0.25 + particle.delay, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={index === 0 ? () => setBurstDone(true) : undefined}
          />
        ))}
      <motion.span
        role="img"
        aria-label={de.pages.study.verdicts[verdict]}
        className="relative flex size-14 items-center justify-center rounded-full text-white"
        style={{
          background: correct ? 'var(--success)' : 'var(--danger)',
          boxShadow: `0 10px 28px -8px ${correct ? 'var(--success-glow)' : 'var(--danger-glow)'}`,
        }}
        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22, delay: reduced ? 0 : 0.2 }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
          {correct ? (
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...draw}
            />
          ) : (
            <>
              <motion.path
                d="M7 7l10 10"
                stroke="currentColor"
                strokeWidth={2.8}
                strokeLinecap="round"
                {...draw}
              />
              <motion.path
                d="M17 7L7 17"
                stroke="currentColor"
                strokeWidth={2.8}
                strokeLinecap="round"
                {...draw}
                {...(reduced
                  ? {}
                  : { transition: { duration: 0.3, delay: 0.45, ease: 'easeOut' } })}
              />
            </>
          )}
        </svg>
      </motion.span>
    </div>
  );
}

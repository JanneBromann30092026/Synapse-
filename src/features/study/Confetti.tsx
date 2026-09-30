import { useState } from 'react';
import { motion } from 'motion/react';
import { confettiPieces, type ConfettiPiece } from '@/core/study/presentation';

const COUNT = 44;
/** Starts once the ring of the summary has appeared. */
const START_DELAY_S = 0.35;

function Shape({ piece, color }: { piece: ConfettiPiece; color: string }) {
  const { size } = piece;
  switch (piece.shape) {
    case 'circle':
      return (
        <span
          className="block rounded-full"
          style={{ width: size, height: size, background: color }}
        />
      );
    case 'square':
      return (
        <span
          className="block rounded-[3px]"
          style={{ width: size * 0.9, height: size * 0.9, background: color }}
        />
      );
    case 'ring':
      return (
        <span
          className="block rounded-full"
          style={{ width: size, height: size, border: `2.5px solid ${color}` }}
        />
      );
    case 'triangle':
      return (
        <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden className="block">
          <path d="M5 1.2 9 8.8H1Z" fill={color} strokeLinejoin="round" />
        </svg>
      );
  }
}

/**
 * One tasteful burst (~2 s) of round and geometric shapes from the center of the parent,
 * in the project and accent colors. Removes itself when done; nothing with reduced motion.
 */
export function Confetti({ colors, reduced }: { colors: string[]; reduced: boolean }) {
  const [pieces] = useState(() =>
    reduced
      ? []
      : // Wide and flat: the summary scrolls, so pieces must not fly far above the ring.
        confettiPieces(COUNT, Math.random, { tones: colors.length, spread: 340, height: 130 }),
  );
  const [done, setDone] = useState(false);
  if (done || pieces.length === 0) return null;
  const last = pieces.reduce((a, b) => (a.delay + a.duration >= b.delay + b.duration ? a : b));

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 z-20"
      data-testid="confetti"
    >
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute block"
          style={{ left: -piece.size / 2, top: -piece.size / 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.5 }}
          animate={{
            x: [0, piece.peakX, piece.endX],
            y: [0, piece.peakY, piece.endY],
            rotate: [0, piece.rotate * 0.4, piece.rotate],
            opacity: [1, 1, 0],
            scale: [0.5, 1, 0.9],
          }}
          transition={{
            duration: piece.duration,
            delay: START_DELAY_S + piece.delay,
            times: [0, 0.35, 1],
            ease: ['easeOut', 'easeIn'],
          }}
          onAnimationComplete={piece.id === last.id ? () => setDone(true) : undefined}
        >
          <Shape piece={piece} color={colors[piece.tone] ?? colors[0] ?? 'var(--accent)'} />
        </motion.span>
      ))}
    </div>
  );
}

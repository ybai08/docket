import type { CSSProperties, ReactNode } from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

import { C, SAFE, sans, serif } from './theme';

/** 0 → 1 spring that starts at `delay` frames. */
export function useEnter(delay = 0, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } });
}

/** Fades and lifts children in at `delay`, and out from `outAt` if given. */
export function Rise({ delay = 0, outAt, children, style }: { delay?: number; outAt?: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const t = useEnter(delay);
  const out = outAt == null ? 0 : interpolate(frame, [outAt, outAt + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ ...style, opacity: t * (1 - out), transform: `translateY(${(1 - t) * 28 - out * 16}px)` }}>{children}</div>
  );
}

export function Background({ tint }: { tint?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.ground }}>
      {tint ? (
        // A soft wash of the scene's color behind the phone, kept clear of the facecam corner.
        <div
          style={{
            position: 'absolute',
            left: 820,
            top: -160,
            width: 900,
            height: 900,
            borderRadius: 450,
            background: tint,
            opacity: 0.35,
            filter: 'blur(90px)',
          }}
        />
      ) : null}
    </div>
  );
}

export const SCREEN_W = 400;
export const SCREEN_H = Math.round((400 * 2622) / 1206);
const BEZEL = 14;

/** An iPhone-style frame. Children fill the 400-wide screen (1px = 1pt, like the app). */
const PHONE_SCALE = 1.1;

export function Phone({ x = 896, delay = 0, children }: { x?: number; delay?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const t = useEnter(delay, 20);
  const float = Math.sin(frame / 40) * 4;
  // Scaled from the top-left corner, so the right edge lands at x + 428 * 1.1 (about 1367), clear of the facecam.
  const top = (1080 - (SCREEN_H + BEZEL * 2) * PHONE_SCALE) / 2;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: top + (1 - t) * 120 + float,
        transform: `scale(${PHONE_SCALE})`,
        transformOrigin: '0 0',
        width: SCREEN_W + BEZEL * 2,
        height: SCREEN_H + BEZEL * 2,
        padding: BEZEL,
        borderRadius: 68,
        background: '#0D0D0F',
        boxShadow: '0 50px 90px rgba(0,0,0,0.20), 0 10px 24px rgba(0,0,0,0.12), inset 0 0 0 2px #2A2A2E',
        opacity: t,
      }}>
      <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, borderRadius: 54, overflow: 'hidden', background: C.ground }}>
        {children}
        <div
          style={{
            position: 'absolute',
            top: 11,
            left: (SCREEN_W - 120) / 2,
            width: 120,
            height: 34,
            borderRadius: 20,
            background: '#000',
          }}
        />
      </div>
    </div>
  );
}

/** Screenshots that crossfade into each other at the given frames. */
export function Screens({ shots }: { shots: { src: string; at: number }[] }) {
  const frame = useCurrentFrame();
  return (
    <>
      {shots.map((s, i) => {
        const opacity = i === 0 ? 1 : interpolate(frame, [s.at, s.at + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const lift = i === 0 ? 0 : interpolate(frame, [s.at, s.at + 18], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <Img
            key={s.src}
            src={staticFile(`footage/${s.src}.jpg`)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity, transform: `translateY(${lift}px)` }}
          />
        );
      })}
    </>
  );
}

/** Chapter pill, serif headline, supporting line: the left column of every product scene. */
export function Copy({
  label,
  color,
  title,
  body,
  delay = 6,
  outAt,
  top = 330,
}: {
  label: string;
  color: string;
  title: string;
  body: string;
  delay?: number;
  outAt?: number;
  top?: number;
}) {
  return (
    <div style={{ position: 'absolute', left: 150, top, width: 690 }}>
      <Rise delay={delay} outAt={outAt}>
        <div
          style={{
            display: 'inline-block',
            padding: '8px 18px',
            borderRadius: 999,
            background: color,
            fontFamily: sans,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 0.3,
            color: C.ink,
          }}>
          {label}
        </div>
      </Rise>
      <Rise delay={delay + 5} outAt={outAt}>
        <div style={{ marginTop: 26, fontFamily: serif, fontWeight: 800, fontSize: 92, lineHeight: 1.02, letterSpacing: -1.6, color: C.ink }}>
          {title}
        </div>
      </Rise>
      <Rise delay={delay + 10} outAt={outAt}>
        <div style={{ marginTop: 24, fontFamily: sans, fontWeight: 400, fontSize: 34, lineHeight: 1.42, color: C.text2 }}>{body}</div>
      </Rise>
    </div>
  );
}

/** A rubber-stamp label that slams in with a little overshoot, like the app's FILED / FAKE stamps. */
export function Stamp({ label, color, delay, size = 34, rotate = -8, style }: { label: string; color: string; delay: number; size?: number; rotate?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 220, mass: 0.6 } });
  const scale = interpolate(t, [0, 1], [2.2, 1]);
  return (
    <div
      style={{
        ...style,
        opacity: frame < delay ? 0 : Math.min(1, t * 1.6),
        transform: `rotate(${rotate}deg) scale(${scale})`,
        padding: `${size * 0.18}px ${size * 0.5}px`,
        border: `${Math.max(3, size * 0.11)}px solid ${color}`,
        borderRadius: size * 0.28,
        color,
        fontFamily: sans,
        fontWeight: 900,
        fontSize: size,
        letterSpacing: size * 0.12,
        background: 'rgba(255,255,255,0.86)',
      }}>
      {label}
    </div>
  );
}

/** A finger-tap ripple at a point on the phone screen. */
export function Tap({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (frame < at || p >= 1) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 34,
        top: y - 34,
        width: 68,
        height: 68,
        borderRadius: 34,
        background: 'rgba(0,0,0,0.18)',
        border: '3px solid rgba(0,0,0,0.35)',
        transform: `scale(${0.6 + p * 0.8})`,
        opacity: 1 - p,
      }}
    />
  );
}

/** Three ballot tiles filling in, like the app's progress tiles. */
export function Tiles({ delay, size = 26, gap = 10 }: { delay: number; size?: number; gap?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', gap }}>
      {[0, 1, 2].map((i) => {
        const on = frame >= delay + i * 7;
        return (
          <div
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size * 0.2,
              border: `${size * 0.1}px solid ${C.ink}`,
              background: on ? [C.lavender, C.yellow, C.teal][i] : C.ground,
              transform: on ? 'scale(1)' : 'scale(0.9)',
            }}
          />
        );
      })}
    </div>
  );
}

export function Wordmark({ size = 180, delay = 0 }: { size?: number; delay?: number }) {
  const t = useEnter(delay, 16);
  return (
    <div
      style={{
        fontFamily: serif,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: -size * 0.035,
        color: C.ink,
        opacity: t,
        transform: `scale(${0.92 + t * 0.08})`,
      }}>
      Docket
    </div>
  );
}

/** Outlines the facecam corner. Only drawn when rendering with showSafeZone. */
export function SafeZone() {
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.x,
        top: SAFE.y,
        right: 0,
        bottom: 0,
        border: '4px dashed rgba(220,0,120,0.8)',
        background: 'rgba(220,0,120,0.08)',
        fontFamily: sans,
        fontSize: 28,
        color: 'rgba(220,0,120,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      Facecam
    </div>
  );
}

import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Easing,
} from 'remotion';
import { C, ACCENT_CYCLE, SPRING_SNAPPY, SPRING_SOFT } from '../themes';

export interface TikTokProps {
  title: string;
  hookLine: string;
  hookSubline: string;
  items: string[];
  ctaLine: string;
  stat?: string;
}

// Animated reveal helper
function useSpring(frame: number, delay: number, fps: number, config = SPRING_SNAPPY) {
  return spring({ frame: frame - delay, fps, config, durationInFrames: 30 });
}

// Number circle component
const Circle: React.FC<{ n: number; color: string; size: number }> = ({ n, color, size }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    background: color, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: size * 0.45, color: C.white,
    fontFamily: "'Inter', 'Arial Black', sans-serif",
    boxShadow: `0 4px 12px ${color}66`,
  }}>{n}</div>
);

export const TikTok: React.FC<TikTokProps> = ({
  title, hookLine, hookSubline, items, ctaLine, stat,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const W = width, H = height;

  // ── Phase timing (frames) ───────────────────────────────────────────────
  const HEADER_IN    = 0;
  const BANNER_IN    = 18;
  const HOOK_IN      = 35;
  const PILLS_START  = 60;
  const WIPE_START   = 150;
  const WIPE_END     = 180;
  const ITEMS_START  = 175;
  const CTA_IN       = 265;

  // ── Phase 1: Background ─────────────────────────────────────────────────
  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  // ── Phase 2: Header ─────────────────────────────────────────────────────
  const headerProgress = useSpring(frame, HEADER_IN, fps);
  const headerY = interpolate(headerProgress, [0, 1], [-80, 0]);
  const headerOpacity = interpolate(headerProgress, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });

  // ── Phase 3: Banner sweep ───────────────────────────────────────────────
  const bannerProgress = useSpring(frame, BANNER_IN, fps, SPRING_SOFT);
  const bannerX = interpolate(bannerProgress, [0, 1], [-W * 1.1, 0]);
  const bannerOpacity = interpolate(bannerProgress, [0, 0.2], [0, 1], { extrapolateRight: 'clamp' });

  // ── Phase 4: Hook text ──────────────────────────────────────────────────
  const hookProgress = useSpring(frame, HOOK_IN, fps);
  const hookY = interpolate(hookProgress, [0, 1], [50, 0]);

  // ── Phase 5: Preview pills ──────────────────────────────────────────────
  const previewItems = items.slice(0, 3);
  const pillsProgress = previewItems.map((_, i) =>
    spring({ frame: frame - (PILLS_START + i * 14), fps, config: SPRING_SNAPPY, durationInFrames: 25 })
  );
  const moreOpacity = interpolate(frame, [PILLS_START + 60, PILLS_START + 80], [0, 1], { extrapolateRight: 'clamp' });

  // ── Phase 6: Scene wipe (slide up transition) ───────────────────────────
  const wipeY = interpolate(frame, [WIPE_START, WIPE_END], [0, -H], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  // ── Phase 7: Items list ─────────────────────────────────────────────────
  const itemsProgress = items.map((_, i) =>
    spring({ frame: frame - (ITEMS_START + i * 12), fps, config: SPRING_SNAPPY, durationInFrames: 22 })
  );

  // ── Phase 8: CTA ────────────────────────────────────────────────────────
  const ctaProgress = useSpring(frame, CTA_IN, fps, SPRING_SOFT);
  const ctaScale = interpolate(ctaProgress, [0, 1], [0.7, 1]);

  // Show items phase once wipe completes
  const showItems = frame >= WIPE_END - 5;

  return (
    <AbsoluteFill style={{ fontFamily: "'Inter', 'Arial Black', sans-serif", overflow: 'hidden' }}>

      {/* ── PHASE 1+2: Hook scene ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', inset: 0,
        background: C.bg_warm,
        opacity: bgOpacity,
        transform: `translateY(${wipeY}px)`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          height: 90, background: C.blue_dark,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `translateY(${headerY}px)`,
          opacity: headerOpacity,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 10,
        }}>
          <span style={{
            color: C.yellow, fontSize: 36, fontWeight: 900,
            letterSpacing: 2, textTransform: 'uppercase',
          }}>SimpleNursing</span>
        </div>

        {/* Yellow banner */}
        <div style={{
          marginTop: 48,
          transform: `translateX(${bannerX}px) skewY(-2.5deg)`,
          opacity: bannerOpacity,
          background: C.yellow,
          padding: '28px 48px',
          marginLeft: -20, marginRight: -20,
          boxShadow: '0 8px 30px rgba(250,215,79,0.5)',
        }}>
          <div style={{
            transform: 'skewY(2.5deg)',
            fontSize: 52, fontWeight: 900,
            color: C.black, lineHeight: 1.1,
            textTransform: 'uppercase',
            letterSpacing: -1,
          }}>
            {hookLine}
          </div>
        </div>

        {/* Hook subline */}
        <div style={{
          marginTop: 32, paddingLeft: 32, paddingRight: 32,
          transform: `translateY(${hookY}px)`,
          opacity: hookProgress,
        }}>
          <div style={{
            fontSize: 38, fontWeight: 700, color: C.blue_dark,
            lineHeight: 1.3,
          }}>{hookSubline}</div>
          {stat && (
            <div style={{
              marginTop: 16, fontSize: 30, color: C.blue_mid,
              fontWeight: 600, fontStyle: 'italic',
            }}>{stat}</div>
          )}
        </div>

        {/* Preview pills */}
        <div style={{
          marginTop: 'auto', padding: '0 28px 40px',
        }}>
          <div style={{ fontSize: 26, color: C.blue_mid, fontWeight: 700, marginBottom: 16 }}>
            What's covered:
          </div>
          {previewItems.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              marginBottom: 18,
              transform: `translateX(${interpolate(pillsProgress[i], [0, 1], [-60, 0])}px) scale(${interpolate(pillsProgress[i], [0, 1], [0.85, 1])})`,
              opacity: pillsProgress[i],
            }}>
              <Circle n={i + 1} color={ACCENT_CYCLE[i]} size={52} />
              <div style={{
                background: C.white, borderRadius: 14,
                padding: '12px 20px', flex: 1,
                fontSize: 28, fontWeight: 700, color: C.black,
                boxShadow: `4px 4px 0 ${ACCENT_CYCLE[i]}`,
              }}>{item}</div>
            </div>
          ))}
          {items.length > 3 && (
            <div style={{
              textAlign: 'right', fontSize: 28, fontWeight: 800,
              color: C.pink, opacity: moreOpacity,
              paddingRight: 16,
            }}>
              +{items.length - 3} more →
            </div>
          )}
        </div>
      </div>

      {/* ── PHASE 3: Items scene ──────────────────────────────────────────── */}
      {showItems && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(160deg, ${C.bg_light} 0%, ${C.white} 100%)`,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Top accent bar */}
          <div style={{
            height: 12, background: C.yellow,
            boxShadow: '0 2px 8px rgba(250,215,79,0.6)',
          }} />

          <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
            <div style={{
              fontSize: 30, fontWeight: 900, color: C.blue_dark,
              textTransform: 'uppercase', letterSpacing: 1,
            }}>{title}</div>
          </div>

          {/* Items list */}
          <div style={{
            flex: 1, padding: '20px 32px',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'space-evenly',
          }}>
            {items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 20,
                transform: `translateX(${interpolate(itemsProgress[i], [0, 1], [-80, 0])}px)`,
                opacity: Math.min(1, itemsProgress[i] * 1.2),
              }}>
                <Circle n={i + 1} color={ACCENT_CYCLE[i % ACCENT_CYCLE.length]} size={58} />
                <div style={{
                  fontSize: 30, fontWeight: 700, color: C.black,
                  lineHeight: 1.25,
                  borderBottom: `2px solid ${ACCENT_CYCLE[i % ACCENT_CYCLE.length]}22`,
                  paddingBottom: 6, flex: 1,
                }}>{item}</div>
              </div>
            ))}
          </div>

          {/* CTA footer */}
          <div style={{
            background: C.blue_dark,
            padding: '28px 32px',
            transform: `scale(${ctaScale})`,
            transformOrigin: 'bottom center',
            opacity: ctaProgress,
          }}>
            <div style={{
              fontSize: 30, fontWeight: 800, color: C.yellow,
              textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1,
            }}>{ctaLine}</div>
            <div style={{
              fontSize: 24, color: C.blue_light,
              textAlign: 'center', marginTop: 8,
            }}>simplenursing.com</div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

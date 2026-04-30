import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate,
} from 'remotion';
import { C, ACCENT_CYCLE, SPRING_SNAPPY, SPRING_SOFT } from '../themes';

export interface PinterestProps {
  title: string;
  hookLine: string;
  items: string[];
  ctaLine: string;
}

const Circle: React.FC<{ n: number; color: string }> = ({ n, color }) => (
  <div style={{
    width: 52, height: 52, borderRadius: '50%', background: color,
    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 24, fontWeight: 900, color: C.white,
    fontFamily: "'Inter', 'Arial Black', sans-serif",
    boxShadow: `0 4px 12px ${color}55`,
  }}>{n}</div>
);

export const Pinterest: React.FC<PinterestProps> = ({ title, hookLine, items, ctaLine }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerP  = spring({ frame: frame - 0,  fps, config: SPRING_SNAPPY, durationInFrames: 22 });
  const bannerP  = spring({ frame: frame - 15, fps, config: SPRING_SOFT,   durationInFrames: 28 });
  const titleP   = spring({ frame: frame - 35, fps, config: SPRING_SNAPPY, durationInFrames: 22 });
  const itemsP   = items.map((_, i) =>
    spring({ frame: frame - (55 + i * 14), fps, config: SPRING_SNAPPY, durationInFrames: 20 })
  );
  const ctaP     = spring({ frame: frame - (55 + items.length * 14 + 10), fps, config: SPRING_SOFT, durationInFrames: 25 });

  return (
    <AbsoluteFill style={{
      background: C.bg_warm,
      fontFamily: "'Inter', 'Arial Black', sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        height: 110, background: C.blue_dark,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `translateY(${interpolate(headerP, [0,1], [-110, 0])}px)`,
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
      }}>
        <span style={{
          color: C.yellow, fontSize: 38, fontWeight: 900,
          letterSpacing: 2, textTransform: 'uppercase',
        }}>SimpleNursing</span>
      </div>

      {/* Banner */}
      <div style={{
        marginTop: 36, marginLeft: -10, marginRight: -10,
        background: C.yellow,
        padding: '22px 40px',
        transform: `skewY(-2deg) scaleX(${interpolate(bannerP, [0,1],[0, 1])})`,
        transformOrigin: 'left center',
        opacity: bannerP,
        boxShadow: '0 8px 24px rgba(250,215,79,0.45)',
      }}>
        <div style={{
          transform: 'skewY(2deg)',
          fontSize: 42, fontWeight: 900,
          color: C.black, lineHeight: 1.15,
          textTransform: 'uppercase', letterSpacing: -0.5,
        }}>{hookLine}</div>
      </div>

      {/* Subtitle */}
      <div style={{
        padding: '20px 40px 8px',
        fontSize: 32, fontWeight: 700, color: C.blue_dark, lineHeight: 1.3,
        opacity: titleP,
        transform: `translateY(${interpolate(titleP, [0,1],[20,0])}px)`,
      }}>{title}</div>

      {/* Divider */}
      <div style={{
        height: 3, background: `linear-gradient(90deg, ${C.blue_mid}, ${C.blue_light}33)`,
        margin: '12px 40px',
        transform: `scaleX(${titleP})`, transformOrigin: 'left',
      }} />

      {/* Items */}
      <div style={{
        flex: 1, padding: '12px 40px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {items.map((item, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 18,
            opacity: itemsP[i],
            transform: `translateX(${interpolate(itemsP[i], [0,1],[-50,0])}px)`,
          }}>
            <Circle n={i + 1} color={ACCENT_CYCLE[i % ACCENT_CYCLE.length]} />
            <span style={{
              fontSize: 30, fontWeight: 600, color: C.black, lineHeight: 1.3,
            }}>{item}</span>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{
        background: C.blue_dark, padding: '28px 40px',
        opacity: ctaP,
        transform: `translateY(${interpolate(ctaP, [0,1],[40,0])}px)`,
      }}>
        <div style={{
          fontSize: 30, fontWeight: 800, color: C.yellow,
          textAlign: 'center', textTransform: 'uppercase',
        }}>{ctaLine}</div>
        <div style={{
          fontSize: 26, color: C.blue_light,
          textAlign: 'center', marginTop: 8,
        }}>simplenursing.com</div>
      </div>
    </AbsoluteFill>
  );
};

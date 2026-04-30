import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Series,
} from 'remotion';
import { C, ACCENT_CYCLE, SPRING_SNAPPY } from '../themes';

export interface InstagramSlide {
  type: 'hook' | 'item' | 'cta';
  headline: string;
  body?: string;
  itemNumber?: number;
  accentColor?: string;
}

export interface InstagramProps {
  title: string;
  slides: InstagramSlide[];
}

const SLIDE_DURATION = 90; // 3s per slide at 30fps

const SlideHook: React.FC<{ slide: InstagramSlide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleP = spring({ frame: frame - 10, fps, config: SPRING_SNAPPY, durationInFrames: 25 });
  const bodyP  = spring({ frame: frame - 28, fps, config: SPRING_SNAPPY, durationInFrames: 25 });
  return (
    <AbsoluteFill style={{
      background: C.blue_dark,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 64, gap: 32,
    }}>
      <div style={{
        background: C.yellow, padding: '20px 36px',
        transform: `skewY(-2deg) scale(${interpolate(titleP, [0,1],[0.85,1])})`,
        opacity: titleP,
      }}>
        <div style={{
          transform: 'skewY(2deg)',
          fontSize: 68, fontWeight: 900, color: C.black,
          textTransform: 'uppercase', lineHeight: 1.1,
          textAlign: 'center', fontFamily: "'Inter', 'Arial Black', sans-serif",
        }}>{slide.headline}</div>
      </div>
      {slide.body && (
        <div style={{
          fontSize: 38, color: C.white, fontWeight: 600,
          textAlign: 'center', lineHeight: 1.4,
          transform: `translateY(${interpolate(bodyP, [0,1],[30,0])}px)`,
          opacity: bodyP,
          fontFamily: "'Inter', sans-serif",
        }}>{slide.body}</div>
      )}
      <div style={{
        position: 'absolute', bottom: 36,
        fontSize: 28, color: C.blue_light, fontWeight: 700,
        opacity: interpolate(frame, [60, 80], [0, 1], { extrapolateRight: 'clamp' }),
      }}>swipe →</div>
    </AbsoluteFill>
  );
};

const SlideItem: React.FC<{ slide: InstagramSlide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = slide.accentColor || C.blue_mid;
  const circleP = spring({ frame: frame - 8, fps, config: SPRING_SNAPPY, durationInFrames: 22 });
  const textP   = spring({ frame: frame - 22, fps, config: SPRING_SNAPPY, durationInFrames: 25 });
  return (
    <AbsoluteFill style={{
      background: C.bg_warm,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 64, gap: 48,
      fontFamily: "'Inter', 'Arial Black', sans-serif",
    }}>
      {/* Big number */}
      <div style={{
        width: 160, height: 160, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 80, fontWeight: 900, color: C.white,
        boxShadow: `0 12px 40px ${color}66`,
        transform: `scale(${circleP})`,
        opacity: circleP,
      }}>{slide.itemNumber}</div>

      {/* Headline */}
      <div style={{
        fontSize: 60, fontWeight: 900, color: C.black,
        textAlign: 'center', lineHeight: 1.1,
        transform: `translateY(${interpolate(textP, [0,1],[40,0])}px)`,
        opacity: textP,
      }}>{slide.headline}</div>

      {slide.body && (
        <div style={{
          fontSize: 36, color: C.blue_dark, fontWeight: 500,
          textAlign: 'center', lineHeight: 1.45,
          opacity: interpolate(frame, [35, 55], [0, 1], { extrapolateRight: 'clamp' }),
        }}>{slide.body}</div>
      )}

      {/* Bottom accent line */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 12, background: color,
      }} />
    </AbsoluteFill>
  );
};

const SlideCTA: React.FC<{ slide: InstagramSlide }> = ({ slide }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - 10, fps, config: SPRING_SNAPPY, durationInFrames: 30 });
  const pulse = interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.97, 1.03]);
  return (
    <AbsoluteFill style={{
      background: `linear-gradient(135deg, ${C.blue_dark} 0%, ${C.blue_mid} 100%)`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 64, gap: 36,
      fontFamily: "'Inter', 'Arial Black', sans-serif",
    }}>
      <div style={{
        background: C.yellow, padding: '24px 40px',
        transform: `skewY(-2deg) scale(${interpolate(p, [0,1],[0.7,1])})`,
        opacity: p,
      }}>
        <div style={{
          transform: 'skewY(2deg)',
          fontSize: 58, fontWeight: 900, color: C.black,
          textTransform: 'uppercase', textAlign: 'center',
        }}>SAVE THIS</div>
      </div>
      <div style={{
        fontSize: 36, color: C.white, fontWeight: 600,
        textAlign: 'center', lineHeight: 1.4,
        opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateRight: 'clamp' }),
      }}>{slide.headline}</div>
      <div style={{
        background: C.white, borderRadius: 50,
        padding: '18px 48px', transform: `scale(${pulse})`,
        opacity: interpolate(frame, [40, 60], [0, 1], { extrapolateRight: 'clamp' }),
      }}>
        <span style={{
          fontSize: 32, fontWeight: 900, color: C.blue_dark,
        }}>simplenursing.com</span>
      </div>
    </AbsoluteFill>
  );
};

export const Instagram: React.FC<InstagramProps> = ({ slides }) => (
  <AbsoluteFill>
    <Series>
      {slides.map((slide, i) => (
        <Series.Sequence key={i} durationInFrames={SLIDE_DURATION}>
          {slide.type === 'hook' && <SlideHook slide={slide} />}
          {slide.type === 'item' && <SlideItem slide={slide} />}
          {slide.type === 'cta'  && <SlideCTA slide={slide} />}
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

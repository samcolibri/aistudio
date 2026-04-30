import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Sequence,
} from 'remotion';
import { C, SPRING_SNAPPY, SPRING_SOFT } from '../themes';

export interface YouTubeBeat {
  label: string;
  color: string;
  lines: string[];
}

export interface YouTubeProps {
  title: string;
  hookLine: string;
  hookSubline: string;
  hookStat?: string;
  beats: YouTubeBeat[];
  ctaLine: string;
  stat?: string;
  sections?: any[]; // legacy compat
  totalFrames?: number;
}

const HOOK_F    = 210;
const BEAT_F    = 210;
const CTA_F     = 150;

// ── Animated dark gradient bg ─────────────────────────────────────────────────
const DarkBg: React.FC = () => {
  const frame = useCurrentFrame();
  const hue = interpolate(frame, [0, 300], [220, 260], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Deep base */}
      <div style={{ position: 'absolute', inset: 0, background: '#080810' }} />
      {/* Slow color pulse top-left */}
      <div style={{
        position: 'absolute',
        top: -300, left: -300,
        width: 900, height: 900,
        borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue},80%,40%,0.18) 0%, transparent 70%)`,
      }} />
      {/* Bottom right accent */}
      <div style={{
        position: 'absolute',
        bottom: -200, right: -200,
        width: 700, height: 700,
        borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue + 40},90%,50%,0.14) 0%, transparent 70%)`,
        transform: `rotate(${frame * 0.15}deg)`,
      }} />
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
      }} />
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)',
      }} />
    </AbsoluteFill>
  );
};

// ── Flash transition (2-frame color burst between beats) ─────────────────────
const FlashIn: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  if (frame > 6) return null;
  const opacity = interpolate(frame, [0, 1, 4, 6], [0, 0.9, 0.5, 0]);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: color,
      opacity,
      zIndex: 50,
      pointerEvents: 'none',
    }} />
  );
};

// ── SN Logo bar ───────────────────────────────────────────────────────────────
const SNBar: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: SPRING_SOFT, durationInFrames: 20 });
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 80,
      display: 'flex', alignItems: 'center', padding: '0 48px',
      background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 100%)',
      opacity: p * opacity, zIndex: 30,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: C.blue_mid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Arial Black', sans-serif",
        fontSize: 14, fontWeight: 900, color: C.white,
        marginRight: 12,
        boxShadow: `0 0 20px ${C.blue_mid}88`,
      }}>SN</div>
      <span style={{
        fontFamily: "'Arial Black', sans-serif",
        fontWeight: 900, fontSize: 20, color: C.white,
        letterSpacing: '-0.3px',
        opacity: 0.9,
      }}>SimpleNursing</span>
      <div style={{
        marginLeft: 'auto',
        fontFamily: "'Inter', sans-serif",
        fontSize: 16, color: 'rgba(255,255,255,0.4)',
        fontWeight: 500,
      }}>simplenursing.com</div>
    </div>
  );
};

// ── EKG bottom bar ────────────────────────────────────────────────────────────
const EKGBar: React.FC = () => {
  const frame = useCurrentFrame();
  const W = 1920;
  const offset = (frame * 6) % W;
  return (
    <svg style={{
      position: 'absolute', bottom: 0, left: 0,
      width: '100%', height: 48, opacity: 0.3,
    }}>
      <polyline
        points={Array.from({ length: 240 }, (_, i) => {
          const x = (i * 8 - offset + W * 2) % W;
          const c = i % 14;
          let y = 24;
          if (c === 5) y = 8; else if (c === 6) y = 44;
          else if (c === 7) y = 4; else if (c === 8) y = 44;
          else if (c === 9) y = 24;
          return `${x},${y}`;
        }).join(' ')}
        stroke={C.green} strokeWidth="2" fill="none" strokeLinecap="round"
      />
    </svg>
  );
};

// ── Big word-pop text ─────────────────────────────────────────────────────────
const WordPop: React.FC<{
  text: string;
  fontSize?: number;
  color?: string;
  startFrame?: number;
  stagger?: number;
  center?: boolean;
}> = ({ text, fontSize = 110, color = C.white, startFrame = 0, stagger = 5, center = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
      justifyContent: center ? 'center' : 'flex-start',
    }}>
      {words.map((w, i) => {
        const f = frame - startFrame - i * stagger;
        const p = spring({ frame: Math.max(0, f), fps, config: { damping: 9, stiffness: 220 }, durationInFrames: 14 });
        const scale = interpolate(p, [0, 0.6, 1], [0, 1.12, 1]);
        const blur  = interpolate(p, [0, 1], [12, 0]);
        return (
          <span key={i} style={{
            fontFamily: "'Arial Black', Impact, sans-serif",
            fontWeight: 900,
            fontSize,
            lineHeight: 1.0,
            color,
            textTransform: 'uppercase',
            letterSpacing: '-3px',
            display: 'inline-block',
            transform: `scale(${scale})`,
            filter: `blur(${blur}px)`,
            opacity: p,
            textShadow: `0 0 40px ${color}55, 4px 4px 0 rgba(0,0,0,0.4)`,
          }}>{w}</span>
        );
      })}
    </div>
  );
};

// ── Count-up number ───────────────────────────────────────────────────────────
const CountUp: React.FC<{ value: string; startFrame?: number; color?: string }> = ({
  value, startFrame = 0, color = C.yellow,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const match = value.match(/(\d+\.?\d*)(.*)/);
  if (!match) return <span style={{ color, fontFamily: "'Arial Black', sans-serif", fontSize: 80, fontWeight: 900 }}>{value}</span>;

  const num    = parseFloat(match[1]);
  const suffix = match[2];
  const p = spring({ frame: Math.max(0, frame - startFrame), fps, config: SPRING_SOFT, durationInFrames: 45 });
  const displayed = (num * p).toFixed(num % 1 !== 0 ? 1 : 0);

  return (
    <span style={{
      fontFamily: "'Arial Black', sans-serif",
      fontWeight: 900, fontSize: 96,
      color,
      textShadow: `0 0 60px ${color}88`,
      letterSpacing: '-3px',
    }}>{displayed}{suffix}</span>
  );
};

// ── HOOK SECTION ──────────────────────────────────────────────────────────────
const HookSection: React.FC<{ hookLine: string; hookSubline: string; hookStat?: string }> = ({
  hookLine, hookSubline, hookStat,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const subP = spring({ frame: frame - 45, fps, config: SPRING_SOFT, durationInFrames: 25 });
  const subY = interpolate(subP, [0, 1], [30, 0]);

  // Accent bar animates in from left
  const barP = spring({ frame: frame - 5, fps, config: SPRING_SNAPPY, durationInFrames: 20 });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '80px 100px' }}>
      <SNBar />
      <EKGBar />

      {/* Left accent line */}
      <div style={{
        position: 'absolute', left: 0, top: '20%', bottom: '20%',
        width: 6,
        background: `linear-gradient(180deg, ${C.pink} 0%, ${C.yellow} 100%)`,
        transform: `scaleY(${barP})`,
        transformOrigin: 'top',
        borderRadius: '0 3px 3px 0',
      }} />

      <div style={{ textAlign: 'center', maxWidth: 1500 }}>
        {/* Hook — massive word-by-word */}
        <WordPop
          text={hookLine}
          fontSize={hookLine.length > 30 ? 88 : 108}
          color={C.white}
          startFrame={8}
          stagger={6}
        />

        {/* Stat counter */}
        {hookStat && (
          <div style={{
            marginTop: 32,
            display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 12,
          }}>
            <CountUp value={hookStat.replace(/[^\d.%$KkMm+]/g, '') || hookStat} startFrame={50} color={C.yellow} />
          </div>
        )}

        {/* Subline */}
        <div style={{
          marginTop: 36,
          transform: `translateY(${subY}px)`, opacity: subP,
        }}>
          <div style={{
            fontFamily: "'Inter', Arial, sans-serif",
            fontSize: 38, color: 'rgba(255,255,255,0.75)',
            fontWeight: 500, lineHeight: 1.4,
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            maxWidth: 1200, margin: '0 auto',
          }}>{hookSubline}</div>
        </div>
      </div>

      {/* Bottom accent */}
      <div style={{
        position: 'absolute', bottom: 70, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 16,
        opacity: subP * 0.6,
      }}>
        <div style={{ width: 40, height: 2, background: C.pink, borderRadius: 1 }} />
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 18, color: 'rgba(255,255,255,0.5)',
          fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase',
        }}>Full breakdown below</div>
        <div style={{ width: 40, height: 2, background: C.pink, borderRadius: 1 }} />
      </div>
    </AbsoluteFill>
  );
};

// ── BEAT SECTION ──────────────────────────────────────────────────────────────
const BeatSection: React.FC<{ beat: YouTubeBeat; index: number }> = ({ beat, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelP = spring({ frame: frame - 8, fps, config: SPRING_SNAPPY, durationInFrames: 20 });

  return (
    <AbsoluteFill style={{ padding: '90px 100px 80px' }}>
      <FlashIn color={beat.color} />
      <SNBar />
      <EKGBar />

      {/* Beat number watermark */}
      <div style={{
        position: 'absolute', right: 80, top: 100,
        fontFamily: "'Arial Black', sans-serif",
        fontSize: 200, fontWeight: 900,
        color: `${beat.color}14`,
        lineHeight: 1, userSelect: 'none',
        letterSpacing: '-8px',
      }}>{String(index + 1).padStart(2, '0')}</div>

      {/* Color accent left bar */}
      <div style={{
        position: 'absolute', left: 0, top: 90, bottom: 80,
        width: 8,
        background: `linear-gradient(180deg, ${beat.color} 0%, ${beat.color}44 100%)`,
        borderRadius: '0 4px 4px 0',
        transform: `scaleY(${labelP})`,
        transformOrigin: 'top',
        boxShadow: `4px 0 20px ${beat.color}66`,
      }} />

      {/* Beat label */}
      <div style={{
        transform: `translateX(${interpolate(labelP, [0, 1], [-60, 0])}px)`,
        opacity: labelP, marginBottom: 48,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 16,
          background: `${beat.color}22`,
          border: `2px solid ${beat.color}66`,
          borderRadius: 12, padding: '10px 28px',
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: beat.color,
            boxShadow: `0 0 12px ${beat.color}`,
          }} />
          <span style={{
            fontFamily: "'Arial Black', sans-serif",
            fontWeight: 900, fontSize: 28, color: beat.color,
            textTransform: 'uppercase', letterSpacing: '2px',
          }}>{beat.label}</span>
        </div>
      </div>

      {/* Lines — each one blasts in */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        {beat.lines.map((line, i) => {
          const delay = 20 + i * 25;
          const lP = spring({ frame: frame - delay, fps, config: { damping: 10, stiffness: 180 }, durationInFrames: 20 });
          const lX = interpolate(lP, [0, 1], [-100, 0]);
          const lScale = interpolate(lP, [0, 0.7, 1], [0.85, 1.03, 1.0]);

          return (
            <div key={i} style={{
              opacity: lP,
              transform: `translateX(${lX}px) scale(${lScale})`,
              transformOrigin: 'left center',
            }}>
              <div style={{
                fontFamily: "'Arial Black', Impact, sans-serif",
                fontWeight: 900,
                fontSize: beat.lines.length > 4 ? 56 : 68,
                color: C.white,
                lineHeight: 1.1,
                textTransform: 'uppercase',
                letterSpacing: '-1.5px',
                textShadow: `3px 3px 0 rgba(0,0,0,0.5), 0 0 40px ${beat.color}33`,
              }}>
                {/* First word gets accent color */}
                {line.split(' ').map((w, wi) => (
                  <span key={wi} style={{
                    color: wi === 0 ? beat.color : C.white,
                    marginRight: 14,
                  }}>{w}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── CTA SECTION ───────────────────────────────────────────────────────────────
const CTASection: React.FC<{ ctaLine: string }> = ({ ctaLine }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = 1 + Math.sin(frame / 12) * 0.03;
  const glow  = Math.abs(Math.sin(frame / 20));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <FlashIn color={C.pink} />
      <EKGBar />

      {/* SN centered */}
      <div style={{
        position: 'absolute', top: 60, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 14, zIndex: 30,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: C.blue_mid,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Arial Black', sans-serif",
          fontSize: 16, fontWeight: 900, color: C.white,
          boxShadow: `0 0 30px ${C.blue_mid}88`,
        }}>SN</div>
        <span style={{
          fontFamily: "'Arial Black', sans-serif",
          fontWeight: 900, fontSize: 24, color: C.white,
        }}>SimpleNursing</span>
      </div>

      <div style={{ textAlign: 'center', zIndex: 10 }}>
        {/* CTA word pop */}
        <WordPop text={ctaLine} fontSize={90} color={C.yellow} startFrame={8} stagger={7} />

        {/* URL with glow pulse */}
        <div style={{
          marginTop: 56,
          transform: `scale(${pulse})`,
          display: 'inline-block',
        }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.blue_dark} 0%, ${C.blue_mid} 100%)`,
            borderRadius: 60, padding: '26px 80px',
            fontFamily: "'Arial Black', sans-serif",
            fontWeight: 900, fontSize: 46, color: C.white,
            letterSpacing: '0.5px',
            boxShadow: `0 12px 50px rgba(0,0,0,0.5), 0 0 ${60 + glow * 40}px ${C.blue_mid}88`,
          }}>simplenursing.com</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── ROOT ──────────────────────────────────────────────────────────────────────
export const YouTube: React.FC<YouTubeProps> = ({
  hookLine, hookSubline, hookStat, beats = [], ctaLine, stat, sections,
  title,
}) => {
  // Legacy: if no beats but has sections, convert
  const actualBeats: YouTubeBeat[] = beats.length > 0 ? beats : (sections || []).map((s: any, i: number) => ({
    label: s.heading || `Point ${i + 1}`,
    color: [C.blue_mid, C.pink, C.green, C.yellow][i % 4],
    lines: s.points || [],
  }));

  return (
    <AbsoluteFill>
      <DarkBg />

      <Sequence from={0} durationInFrames={HOOK_F}>
        <HookSection hookLine={hookLine} hookSubline={hookSubline} hookStat={hookStat || stat} />
      </Sequence>

      {actualBeats.map((beat, i) => (
        <Sequence key={i} from={HOOK_F + i * BEAT_F} durationInFrames={BEAT_F}>
          <BeatSection beat={beat} index={i} />
        </Sequence>
      ))}

      <Sequence from={HOOK_F + actualBeats.length * BEAT_F} durationInFrames={CTA_F}>
        <CTASection ctaLine={ctaLine} />
      </Sequence>
    </AbsoluteFill>
  );
};

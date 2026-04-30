/**
 * NurseMikeYouTube — 1920×1080 YouTube composition
 * Layout: animated dark bg | left 62% content | right 38% Nurse Mike
 * Pose-switches are timed to content beats — add ElevenLabs audio + fal.ai lipsync after render
 *
 * DEMO: 900 frames = 30s @ 30fps
 * FULL VIDEO: increase BEAT_F to 600 (20s) per beat → ~90s per beat section
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Sequence, Easing,
} from 'remotion';
import { MikePoseTimeline, MikePose } from './MikeCharacter';
import { C, SPRING_SNAPPY, SPRING_SOFT, ACCENT_CYCLE } from '../themes';

// ── Timing (frames @ 30fps) ─────────────────────────────────────────────────
const HOOK_F = 210;  // 7s intro
const BEAT_F = 180;  // 6s per content beat
const CTA_F  = 120;  // 4s CTA

// ── Script content ─────────────────────────────────────────────────────────
const BEATS = [
  {
    label: 'The Science Core',
    subtitle: 'These 4 build your clinical foundation',
    color: C.blue_light,
    mikePose: 'pointing' as MikePose,
    items: ['Biology', 'Chemistry', 'Anatomy & Physiology I', 'Anatomy & Physiology II'],
  },
  {
    label: 'Specialized Sciences',
    subtitle: 'Programs weight these heavily in admissions',
    color: C.pink,
    mikePose: 'open_arms' as MikePose,
    items: ['Statistics', 'Microbiology'],
  },
  {
    label: 'Core Skills',
    subtitle: 'Round out your application — and your career',
    color: C.green,
    mikePose: 'talking' as MikePose,
    items: ['English Composition', 'Psychology', 'Nutrition'],
  },
];

// Mike pose timeline keyed to global frame
const MIKE_GLOBAL_TIMELINE: [number, MikePose][] = [
  [0,                             'talking'],
  [HOOK_F,                        'pointing'],
  [HOOK_F + BEAT_F,               'open_arms'],
  [HOOK_F + BEAT_F * 2,           'talking'],
  [HOOK_F + BEAT_F * 3,           'celebrate'],
  [HOOK_F + BEAT_F * 3 + CTA_F - 30, 'idle'],
];

// ── Animated background ─────────────────────────────────────────────────────
const DarkBg: React.FC = () => {
  const frame = useCurrentFrame();
  const hue = interpolate(frame, [0, 900], [215, 250], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#06080f' }} />
      <div style={{
        position: 'absolute', top: -400, left: -400,
        width: 1100, height: 1100, borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue},75%,35%,0.16) 0%, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: -300, right: -200,
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue + 35},85%,45%,0.12) 0%, transparent 70%)`,
        transform: `rotate(${frame * 0.12}deg)`,
      }} />
      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)
        `,
        backgroundSize: '90px 90px',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 100%)',
      }} />
    </AbsoluteFill>
  );
};

// ── Animated EKG bar ────────────────────────────────────────────────────────
const EKGBar: React.FC = () => {
  const frame = useCurrentFrame();
  const W = 1920;
  const offset = (frame * 6) % W;
  return (
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 44, opacity: 0.25 }}>
      <polyline
        points={Array.from({ length: 260 }, (_, i) => {
          const x = (i * 8 - offset + W * 2) % W;
          const c = i % 14;
          let y = 22;
          if (c === 5) y = 8; else if (c === 6) y = 40;
          else if (c === 7) y = 4; else if (c === 8) y = 40; else if (c === 9) y = 22;
          return `${x},${y}`;
        }).join(' ')}
        stroke={C.green} strokeWidth="2" fill="none" strokeLinecap="round"
      />
    </svg>
  );
};

// ── Top bar ─────────────────────────────────────────────────────────────────
const TopBar: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: SPRING_SOFT, durationInFrames: 20 });
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 72,
      display: 'flex', alignItems: 'center', padding: '0 52px',
      background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)',
      opacity: p, zIndex: 30,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        background: C.blue_mid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Arial Black', sans-serif",
        fontSize: 13, fontWeight: 900, color: C.white,
        marginRight: 12,
        boxShadow: `0 0 18px ${C.blue_mid}99`,
      }}>SN</div>
      <span style={{
        fontFamily: "'Arial Black', sans-serif",
        fontWeight: 900, fontSize: 20, color: C.white,
        letterSpacing: '-0.3px', opacity: 0.95,
      }}>SimpleNursing</span>
      <div style={{ marginLeft: 'auto', fontSize: 15, color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
        simplenursing.com
      </div>
    </div>
  );
};

// ── Flash transition ────────────────────────────────────────────────────────
const FlashIn: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  if (frame > 5) return null;
  const opacity = interpolate(frame, [0, 1, 3, 5], [0, 0.85, 0.4, 0]);
  return <div style={{ position: 'absolute', inset: 0, background: color, opacity, zIndex: 50, pointerEvents: 'none' }} />;
};

// ── Hook section ────────────────────────────────────────────────────────────
const HookSection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleP = spring({ frame: frame - 10, fps, config: { damping: 9, stiffness: 200 }, durationInFrames: 18 });
  const subP   = spring({ frame: frame - 55, fps, config: SPRING_SOFT, durationInFrames: 25 });
  const statP  = spring({ frame: frame - 90, fps, config: SPRING_SOFT, durationInFrames: 30 });
  const barP   = spring({ frame: frame - 5,  fps, config: SPRING_SNAPPY, durationInFrames: 20 });

  const titleWords = 'Every Nursing Program Wants The Same 9 Classes'.split(' ');

  return (
    <AbsoluteFill>
      {/* Left content panel */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '90px 60px 80px 80px',
      }}>
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: '15%', bottom: '15%',
          width: 6,
          background: `linear-gradient(180deg, ${C.pink} 0%, ${C.yellow} 100%)`,
          transform: `scaleY(${barP})`, transformOrigin: 'top',
          borderRadius: '0 3px 3px 0',
          boxShadow: `3px 0 20px ${C.pink}55`,
        }} />

        {/* Title word-pop */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginBottom: 36 }}>
          {titleWords.map((w, i) => {
            const f = frame - 10 - i * 6;
            const p = spring({ frame: Math.max(0, f), fps, config: { damping: 9, stiffness: 220 }, durationInFrames: 14 });
            const isNumber = w === '9';
            return (
              <span key={i} style={{
                fontFamily: "'Arial Black', Impact, sans-serif",
                fontWeight: 900, fontSize: w.length > 5 ? 72 : 82,
                lineHeight: 1.0, textTransform: 'uppercase',
                letterSpacing: '-2px', display: 'inline-block',
                color: isNumber ? C.yellow : C.white,
                transform: `scale(${interpolate(p, [0, 0.6, 1], [0, 1.1, 1])})`,
                filter: `blur(${interpolate(p, [0, 1], [10, 0])}px)`,
                opacity: p,
                textShadow: `0 0 40px ${isNumber ? C.yellow : C.white}33, 3px 3px 0 rgba(0,0,0,0.4)`,
              }}>{w}</span>
            );
          })}
        </div>

        {/* Subline */}
        <div style={{
          transform: `translateY(${interpolate(subP, [0, 1], [30, 0])}px)`,
          opacity: subP, marginBottom: 40,
        }}>
          <p style={{
            fontFamily: "'Inter', Arial, sans-serif",
            fontSize: 32, color: 'rgba(255,255,255,0.72)',
            fontWeight: 400, lineHeight: 1.5, margin: 0,
          }}>
            Most pre-nursing students waste semesters on electives.<br />
            <span style={{ color: C.blue_light, fontWeight: 600 }}>Here's the exact list every ADN and BSN program checks.</span>
          </p>
        </div>

        {/* Stat pill */}
        <div style={{
          opacity: statP,
          transform: `translateX(${interpolate(statP, [0, 1], [-50, 0])}px)`,
          display: 'inline-flex', alignItems: 'center', gap: 16,
          background: `${C.yellow}18`,
          border: `2px solid ${C.yellow}55`,
          borderRadius: 14, padding: '14px 28px',
          width: 'fit-content',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.yellow, boxShadow: `0 0 10px ${C.yellow}` }} />
          <span style={{
            fontFamily: "'Arial Black', sans-serif",
            fontSize: 26, color: C.yellow, fontWeight: 900,
          }}>9 required prerequisites — all programs, all states</span>
        </div>
      </div>

      {/* Mike panel - right 38% */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 44,
      }}>
        {/* Glow behind Mike */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 340, height: 500,
          background: `radial-gradient(ellipse at 50% 80%, ${C.blue_mid}30 0%, transparent 70%)`,
        }} />
        <MikePoseTimeline
          timeline={MIKE_GLOBAL_TIMELINE}
          scale={1.4}
          bottom={44}
          left={0}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── Beat section ────────────────────────────────────────────────────────────
const BeatSection: React.FC<{
  beat: typeof BEATS[0];
  beatIndex: number;
  globalFrameOffset: number;
}> = ({ beat, beatIndex, globalFrameOffset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelP = spring({ frame: frame - 8,  fps, config: SPRING_SNAPPY, durationInFrames: 20 });
  const subP   = spring({ frame: frame - 28, fps, config: SPRING_SOFT,   durationInFrames: 22 });

  return (
    <AbsoluteFill>
      <FlashIn color={beat.color} />

      {/* Left content panel */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%',
        padding: '90px 60px 80px 80px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: '12%', bottom: '12%',
          width: 7,
          background: `linear-gradient(180deg, ${beat.color} 0%, ${beat.color}44 100%)`,
          transform: `scaleY(${labelP})`, transformOrigin: 'top',
          borderRadius: '0 4px 4px 0',
          boxShadow: `4px 0 20px ${beat.color}55`,
        }} />

        {/* Beat number watermark */}
        <div style={{
          position: 'absolute', right: 40, top: 80,
          fontFamily: "'Arial Black', sans-serif",
          fontSize: 240, fontWeight: 900,
          color: `${beat.color}12`, lineHeight: 1, userSelect: 'none',
          letterSpacing: '-10px',
        }}>{String(beatIndex + 1).padStart(2, '0')}</div>

        {/* Label badge */}
        <div style={{
          transform: `translateX(${interpolate(labelP, [0, 1], [-60, 0])}px)`,
          opacity: labelP, marginBottom: 28,
          display: 'inline-flex', alignItems: 'center', gap: 14,
          background: `${beat.color}20`, border: `2px solid ${beat.color}55`,
          borderRadius: 12, padding: '10px 26px', width: 'fit-content',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: beat.color, boxShadow: `0 0 10px ${beat.color}` }} />
          <span style={{
            fontFamily: "'Arial Black', sans-serif",
            fontWeight: 900, fontSize: 26, color: beat.color,
            textTransform: 'uppercase', letterSpacing: '2px',
          }}>{beat.label}</span>
        </div>

        {/* Subtitle */}
        <div style={{ opacity: subP, transform: `translateY(${interpolate(subP, [0, 1], [20, 0])}px)`, marginBottom: 36 }}>
          <p style={{
            fontFamily: "'Inter', Arial, sans-serif",
            fontSize: 28, color: 'rgba(255,255,255,0.6)',
            fontWeight: 400, margin: 0, lineHeight: 1.4,
          }}>{beat.subtitle}</p>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {beat.items.map((item, i) => {
            const delay = 35 + i * 22;
            const lP = spring({ frame: frame - delay, fps, config: { damping: 11, stiffness: 190 }, durationInFrames: 20 });
            return (
              <div key={i} style={{
                opacity: lP,
                transform: `translateX(${interpolate(lP, [0, 1], [-80, 0])}px) scale(${interpolate(lP, [0, 0.7, 1], [0.88, 1.03, 1])})`,
                transformOrigin: 'left center',
                display: 'flex', alignItems: 'center', gap: 20,
              }}>
                {/* Number circle */}
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: beat.color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Arial Black', sans-serif",
                  fontSize: 20, fontWeight: 900,
                  color: beat.color === C.yellow ? C.black : C.white,
                  boxShadow: `0 4px 16px ${beat.color}44`,
                }}>
                  {BEATS.slice(0, beatIndex).reduce((a, b) => a + b.items.length, 0) + i + 1}
                </div>
                {/* Item text */}
                <div style={{
                  fontFamily: "'Arial Black', Impact, sans-serif",
                  fontWeight: 900, fontSize: 52,
                  color: C.white, lineHeight: 1.0,
                  textTransform: 'uppercase', letterSpacing: '-1px',
                  textShadow: `2px 2px 0 rgba(0,0,0,0.5), 0 0 30px ${beat.color}22`,
                }}>{item}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mike panel - right */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 44,
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 340, height: 520,
          background: `radial-gradient(ellipse at 50% 80%, ${beat.color}28 0%, transparent 70%)`,
        }} />
        <MikePoseTimeline
          timeline={[[0, beat.mikePose]]}
          scale={1.4}
          bottom={44}
          left={0}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── CTA section ─────────────────────────────────────────────────────────────
const CTASection: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pulse = 1 + Math.sin(frame / 12) * 0.03;
  const glow  = Math.abs(Math.sin(frame / 18));
  const urlP  = spring({ frame: frame - 25, fps, config: SPRING_SOFT, durationInFrames: 28 });

  const words = 'Map Your Nursing School Path'.split(' ');

  return (
    <AbsoluteFill>
      <FlashIn color={C.pink} />
      <EKGBar />

      {/* Left content */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '62%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '80px',
        gap: 32,
      }}>
        {/* SimpleNursing centered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: C.blue_mid,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Arial Black', sans-serif",
            fontSize: 16, fontWeight: 900, color: C.white,
            boxShadow: `0 0 28px ${C.blue_mid}88`,
          }}>SN</div>
          <span style={{
            fontFamily: "'Arial Black', sans-serif",
            fontWeight: 900, fontSize: 26, color: C.white,
          }}>SimpleNursing</span>
        </div>

        {/* CTA headline */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', justifyContent: 'center' }}>
          {words.map((w, i) => {
            const f = frame - 10 - i * 7;
            const p = spring({ frame: Math.max(0, f), fps, config: { damping: 9, stiffness: 220 }, durationInFrames: 14 });
            return (
              <span key={i} style={{
                fontFamily: "'Arial Black', Impact, sans-serif",
                fontWeight: 900, fontSize: 72, lineHeight: 1.0,
                textTransform: 'uppercase', letterSpacing: '-2px',
                display: 'inline-block',
                color: i === 0 ? C.yellow : C.white,
                transform: `scale(${interpolate(p, [0, 0.6, 1], [0, 1.1, 1])})`,
                opacity: p,
                textShadow: `3px 3px 0 rgba(0,0,0,0.45)`,
              }}>{w}</span>
            );
          })}
        </div>

        {/* URL button */}
        <div style={{ transform: `scale(${urlP * pulse})`, opacity: urlP }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.blue_dark} 0%, ${C.blue_mid} 100%)`,
            borderRadius: 60, padding: '24px 70px',
            fontFamily: "'Arial Black', sans-serif",
            fontWeight: 900, fontSize: 42, color: C.white,
            letterSpacing: '0.5px',
            boxShadow: `0 12px 50px rgba(0,0,0,0.5), 0 0 ${55 + glow * 35}px ${C.blue_mid}88`,
          }}>simplenursing.com/quiz</div>
        </div>
      </div>

      {/* Mike celebrating */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: 44,
      }}>
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 340, height: 520,
          background: `radial-gradient(ellipse at 50% 80%, ${C.yellow}28 0%, transparent 70%)`,
        }} />
        <MikePoseTimeline
          timeline={[[0, 'celebrate'], [60, 'idle']]}
          scale={1.4}
          bottom={44}
          left={0}
        />
      </div>
    </AbsoluteFill>
  );
};

// ── Root ─────────────────────────────────────────────────────────────────────
export const NurseMikeYouTube: React.FC = () => {
  const totalBeats = BEATS.length;
  const totalFrames = HOOK_F + totalBeats * BEAT_F + CTA_F;

  return (
    <AbsoluteFill>
      <DarkBg />
      <TopBar />
      <EKGBar />

      <Sequence from={0} durationInFrames={HOOK_F}>
        <HookSection />
      </Sequence>

      {BEATS.map((beat, i) => (
        <Sequence key={i} from={HOOK_F + i * BEAT_F} durationInFrames={BEAT_F}>
          <BeatSection
            beat={beat}
            beatIndex={i}
            globalFrameOffset={HOOK_F + i * BEAT_F}
          />
        </Sequence>
      ))}

      <Sequence from={HOOK_F + totalBeats * BEAT_F} durationInFrames={CTA_F}>
        <CTASection />
      </Sequence>
    </AbsoluteFill>
  );
};

export const NURSE_MIKE_YOUTUBE_FRAMES = HOOK_F + BEATS.length * BEAT_F + CTA_F;

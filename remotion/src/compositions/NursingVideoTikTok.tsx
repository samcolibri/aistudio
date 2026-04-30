import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, OffthreadVideo, staticFile,
} from 'remotion';

const CLASSES = [
  { name: 'BIOLOGY',               color: '#75c7e6' },
  { name: 'CHEMISTRY',             color: '#00709c' },
  { name: 'ANATOMY & PHYSIOLOGY I',  color: '#fc3467' },
  { name: 'ANATOMY & PHYSIOLOGY II', color: '#62d070' },
  { name: 'STATISTICS',            color: '#fad74f' },
  { name: 'MICROBIOLOGY',          color: '#75c7e6' },
  { name: 'ENGLISH COMP',          color: '#00709c' },
  { name: 'PSYCHOLOGY',            color: '#fc3467' },
  { name: 'NUTRITION',             color: '#62d070' },
];

// Timing (30fps)
const PLAYBACK_RATE   = 0.6;   // slow the raw video down
const HOOK_IN         = 15;    // hook text fades in
const CLASSES_START   = 65;    // first class appears at ~2.2s
const FRAMES_PER_CLASS = 37;   // ~1.23s per class
const SHOW_ALL_START  = CLASSES_START + 9 * FRAMES_PER_CLASS; // 398
const END_CARD_START  = 420;   // 14s

const DARK_TEXT_CLASSES = new Set([4]); // STATISTICS is yellow → dark text

export const NursingVideoTikTok: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // How many classes have appeared (1-9)
  const appearedCount = frame < CLASSES_START
    ? 0
    : Math.min(9, Math.floor((frame - CLASSES_START) / FRAMES_PER_CLASS) + 1);
  const activeIndex = Math.max(0, appearedCount - 1);

  // Active class bounce-in
  const activeStart = CLASSES_START + activeIndex * FRAMES_PER_CLASS;
  const bounce = spring({
    frame: frame - activeStart,
    fps,
    config: { mass: 0.65, stiffness: 280, damping: 16 },
    durationInFrames: 18,
  });

  // Hook text (0–2s)
  const hookOpacity = interpolate(
    frame, [HOOK_IN, HOOK_IN + 12, CLASSES_START - 12, CLASSES_START],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const hookY = interpolate(
    spring({ frame: frame - HOOK_IN, fps, config: { mass: 1, stiffness: 80, damping: 20 }, durationInFrames: 20 }),
    [0, 1], [40, 0]
  );

  // Show-all panel (13.3s–14s)
  const showAll = frame >= SHOW_ALL_START && frame < END_CARD_START;
  const showAllBg = interpolate(frame, [SHOW_ALL_START, SHOW_ALL_START + 20], [0, 0.94], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // End card (14s–15s)
  const endCard = frame >= END_CARD_START;
  const endCardOpacity = interpolate(frame, [END_CARD_START, END_CARD_START + 15], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  const inClassPhase = frame >= CLASSES_START && !showAll && !endCard;

  return (
    <AbsoluteFill style={{ fontFamily: "'Inter', 'Arial Black', Arial, sans-serif" }}>

      {/* ── Video background ── */}
      <OffthreadVideo
        src={staticFile('nursing_girl_raw.mp4')}
        playbackRate={PLAYBACK_RATE}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* ── Bottom gradient for text legibility ── */}
      {!endCard && (
        <AbsoluteFill style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 38%, transparent 62%)',
          pointerEvents: 'none',
        }} />
      )}

      {/* ── SimpleNursing badge top-left ── */}
      {!endCard && (
        <div style={{
          position: 'absolute', top: 52, left: 32,
          background: 'rgba(0,83,116,0.90)',
          padding: '10px 22px', borderRadius: 14,
        }}>
          <span style={{ color: '#fad74f', fontWeight: 900, fontSize: 28, letterSpacing: 1 }}>
            SimpleNursing
          </span>
        </div>
      )}

      {/* ── Hook text (0–2s) ── */}
      {frame < CLASSES_START && (
        <div style={{
          position: 'absolute', bottom: 220, left: 0, right: 0,
          textAlign: 'center', padding: '0 44px',
          opacity: hookOpacity,
          transform: `translateY(${hookY}px)`,
        }}>
          <div style={{
            color: '#fff', fontSize: 46, fontWeight: 900,
            lineHeight: 1.2, textShadow: '0 2px 16px rgba(0,0,0,0.9)',
          }}>
            They all want the<br />
            <span style={{ color: '#75c7e6' }}>same 9 classes.</span>
          </div>
        </div>
      )}

      {/* ── Class-by-class reveal (2.2s–13.3s) ── */}
      {inClassPhase && (
        <div style={{
          position: 'absolute', bottom: 60, left: 0, right: 0,
          padding: '0 32px',
        }}>
          {/* Counter */}
          <div style={{
            textAlign: 'center', marginBottom: 18,
            color: 'rgba(255,255,255,0.65)', fontSize: 24,
            fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase',
          }}>
            class {appearedCount} of 9
          </div>

          {/* Active class card */}
          <div style={{
            transform: `scale(${interpolate(bounce, [0, 1], [0.55, 1])}) translateY(${interpolate(bounce, [0, 1], [70, 0])}px)`,
            opacity: bounce,
          }}>
            <div style={{
              background: CLASSES[activeIndex]?.color,
              borderRadius: 22,
              padding: '22px 32px',
              textAlign: 'center',
              boxShadow: `0 10px 40px ${CLASSES[activeIndex]?.color}55`,
            }}>
              <div style={{
                color: DARK_TEXT_CLASSES.has(activeIndex) ? '#282323' : '#fff',
                fontSize: (CLASSES[activeIndex]?.name.length ?? 0) > 14 ? 40 : 52,
                fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.1,
              }}>
                {CLASSES[activeIndex]?.name}
              </div>
            </div>
          </div>

          {/* Previous classes as check-pills */}
          {activeIndex > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8,
              justifyContent: 'center', marginTop: 18,
            }}>
              {CLASSES.slice(0, activeIndex).map((c, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.13)',
                  borderRadius: 100, padding: '5px 14px',
                  color: 'rgba(255,255,255,0.75)', fontSize: 20, fontWeight: 700,
                  border: `1.5px solid ${c.color}66`,
                }}>
                  ✓ {c.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Show-all panel (13.3s–14s) ── */}
      {showAll && (
        <AbsoluteFill style={{
          background: `rgba(0,83,116,${showAllBg})`,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '100px 48px 48px',
        }}>
          <div style={{
            color: '#fad74f', fontSize: 36, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: 2,
            textAlign: 'center', marginBottom: 28,
            opacity: interpolate(frame, [SHOW_ALL_START, SHOW_ALL_START + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}>
            Nine classes. That's the list.
          </div>

          {CLASSES.map((c, i) => {
            const p = spring({
              frame: frame - SHOW_ALL_START - i * 5,
              fps,
              config: { mass: 0.7, stiffness: 220, damping: 18 },
              durationInFrames: 15,
            });
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 18,
                marginBottom: 14,
                transform: `translateX(${interpolate(p, [0, 1], [-90, 0])}px)`,
                opacity: p,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: c.color, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 19,
                  color: i === 4 ? '#282323' : '#fff',
                }}>{i + 1}</div>
                <div style={{
                  color: '#fff', fontSize: 28, fontWeight: 700, lineHeight: 1.2,
                }}>{c.name}</div>
              </div>
            );
          })}
        </AbsoluteFill>
      )}

      {/* ── End card (14s–15s) ── */}
      {endCard && (
        <AbsoluteFill style={{
          background: '#005374',
          opacity: endCardOpacity,
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          gap: 20, padding: '0 48px',
        }}>
          <div style={{
            color: '#fad74f', fontSize: 38, fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: 3, textAlign: 'center',
          }}>SimpleNursing</div>
          <div style={{
            color: '#75c7e6', fontSize: 58, fontWeight: 900,
            textAlign: 'center', lineHeight: 1.1,
          }}>
            simplenursing.com{'\n'}/quiz
          </div>
          <div style={{
            color: 'rgba(255,255,255,0.75)', fontSize: 28, fontWeight: 500,
            textAlign: 'center', lineHeight: 1.4,
          }}>
            Map your exact{'\n'}nursing school path
          </div>
        </AbsoluteFill>
      )}

    </AbsoluteFill>
  );
};

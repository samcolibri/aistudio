/**
 * NurseForgeProduction — Universal data-driven composition
 *
 * Accepts a ProductionManifest as props and renders any channel:
 *   - TikTok  1080×1920: Mike lower-right + text top + Manim PiP
 *   - YouTube 1920×1080: Mike right 38% + content left 62% + Manim PiP
 *   - Instagram/Pinterest: still/carousel (rendered per-slide)
 *
 * Pipeline writes manifest → remotion/public/manifest.json
 * Root.tsx passes it as defaultProps → this component reads it.
 */
import React from 'react';
import {
  AbsoluteFill, useCurrentFrame, useVideoConfig,
  spring, interpolate, Sequence, OffthreadVideo, Img, staticFile, Audio,
  type CalculateMetadataFunction,
} from 'remotion';
import { MikeCharacter, MikePoseTimeline, type MikePose } from './MikeCharacter';
import { C, SPRING_SNAPPY, SPRING_SOFT } from '../themes';

// ── Types (mirrors src/pipeline/analyze-script.ts) ───────────────────────────
export interface SceneSpec {
  index: number;
  startSec: number;
  durationSec: number;
  text: string;
  mikePose: MikePose;
  bgType: 'animated_dark' | 'veo3_clip' | 'imagen4_still' | 'manim_fullscreen';
  bgPrompt: string;
  showDiagram: boolean;
  diagramTopic: string;
  diagramPosition: 'left' | 'right' | 'center' | 'fullscreen';
  textStyle: 'hook' | 'fact' | 'list' | 'cta';
  emphasis: string[];
}

export interface ProductionManifest {
  briefId: string;
  channel: string;
  title: string;
  totalDurationSec: number;
  fps: number;
  resolution: { width: number; height: number };
  voice: string;
  scenes: SceneSpec[];
  thumbnail: { prompt: string };
}

export interface AssetMap {
  voicePath: string | null;
  manimVideos: Record<number, string | null>;       // sceneIndex → remotion public relative path
  backgroundVideos: Record<number, string | null>;
  talkingHeadVideos?: Record<number, string | null>; // sceneIndex → talking head MP4 (SadTalker)
}

export interface NurseForgeProps {
  manifest: ProductionManifest;
  assets: AssetMap;
}

// ── Animated dark background ──────────────────────────────────────────────────
const DarkBg: React.FC<{ totalFrames?: number }> = ({ totalFrames = 900 }) => {
  const frame = useCurrentFrame();
  const hue = interpolate(frame, [0, totalFrames], [215, 250], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: '#06080f' }} />
      <div style={{
        position: 'absolute', top: -400, left: -400,
        width: 1100, height: 1100, borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue},75%,35%,0.18) 0%, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: -300, right: -200,
        width: 800, height: 800, borderRadius: '50%',
        background: `radial-gradient(circle, hsla(${hue + 35},80%,45%,0.13) 0%, transparent 70%)`,
        transform: `rotate(${frame * 0.1}deg)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
        `,
        backgroundSize: '90px 90px',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.5) 100%)',
      }} />
    </AbsoluteFill>
  );
};

// ── Brand badge (top-left) ────────────────────────────────────────────────────
const BrandBadge: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const { fps } = useVideoConfig();
  const p = spring({ frame: localFrame, fps, config: SPRING_SOFT, durationInFrames: 20 });
  return (
    <div style={{
      position: 'absolute', top: 44, left: 36, zIndex: 40,
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(0,83,116,0.85)',
      padding: '8px 18px', borderRadius: 12,
      opacity: p, transform: `translateY(${interpolate(p, [0, 1], [-20, 0])}px)`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: C.blue_mid,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 900, color: '#fff', fontFamily: "'Arial Black', sans-serif",
      }}>SN</div>
      <span style={{
        color: C.yellow, fontWeight: 900, fontSize: 20,
        fontFamily: "'Arial Black', sans-serif", letterSpacing: 0.5,
      }}>SimpleNursing</span>
    </div>
  );
};

// ── EKG bar ───────────────────────────────────────────────────────────────────
const EKGBar: React.FC<{ width?: number }> = ({ width = 1920 }) => {
  const frame = useCurrentFrame();
  const offset = (frame * 5) % width;
  return (
    <svg style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 36, opacity: 0.22 }}>
      <polyline
        points={Array.from({ length: 220 }, (_, i) => {
          const x = (i * 9 - offset + width * 2) % width;
          const c = i % 14;
          let y = 18;
          if (c === 5) y = 6; else if (c === 6) y = 32;
          else if (c === 7) y = 2; else if (c === 8) y = 32; else if (c === 9) y = 18;
          return `${x},${y}`;
        }).join(' ')}
        stroke={C.green} strokeWidth="1.8" fill="none" strokeLinecap="round"
      />
    </svg>
  );
};

// ── Manim diagram PiP overlay ─────────────────────────────────────────────────
const ManimPiP: React.FC<{
  videoSrc: string;
  position: SceneSpec['diagramPosition'];
  isVertical: boolean;
  localFrame: number;
}> = ({ videoSrc, position, isVertical, localFrame }) => {
  const { fps } = useVideoConfig();
  const p = spring({ frame: localFrame - 10, fps, config: SPRING_SNAPPY, durationInFrames: 18 });

  const pipW = isVertical ? 360 : 480;
  const pipH = isVertical ? 203 : 270;  // 16:9 Manim output

  const posStyle: React.CSSProperties =
    position === 'left'   ? { left: 24, bottom: 80 } :
    position === 'right'  ? { right: 24, bottom: 80 } :
    position === 'center' ? { left: '50%', bottom: 80, transform: `translateX(-50%) scale(${p})` } :
    { inset: 0, width: '100%', height: '100%' };  // fullscreen

  if (position === 'fullscreen') {
    return (
      <AbsoluteFill style={{ opacity: p }}>
        <OffthreadVideo src={videoSrc} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </AbsoluteFill>
    );
  }

  return (
    <div style={{
      position: 'absolute', ...posStyle,
      width: pipW, height: pipH,
      borderRadius: 12,
      border: `2px solid ${C.blue_mid}66`,
      overflow: 'hidden',
      boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 20px ${C.blue_mid}44`,
      opacity: p,
      transform: `scale(${interpolate(p, [0, 1], [0.85, 1])})`,
      transformOrigin: position === 'left' ? 'bottom left' : 'bottom right',
    }}>
      <OffthreadVideo
        src={videoSrc}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {/* Label */}
      <div style={{
        position: 'absolute', top: 6, left: 10,
        background: 'rgba(0,0,0,0.7)', borderRadius: 6,
        padding: '2px 8px', fontSize: 11, color: C.blue_light,
        fontFamily: "'Inter', sans-serif", fontWeight: 700,
      }}>📊 Diagram</div>
    </div>
  );
};

// ── Text caption renderer ─────────────────────────────────────────────────────
const SceneCaption: React.FC<{
  text: string;
  emphasis: string[];
  textStyle: SceneSpec['textStyle'];
  isVertical: boolean;
  localFrame: number;
}> = ({ text, emphasis, textStyle, isVertical, localFrame }) => {
  const { fps } = useVideoConfig();
  const p = spring({ frame: localFrame - 5, fps, config: SPRING_SOFT, durationInFrames: 22 });

  const fontSize = isVertical
    ? (textStyle === 'hook' ? 64 : textStyle === 'cta' ? 56 : 48)
    : (textStyle === 'hook' ? 72 : textStyle === 'cta' ? 60 : 54);

  // Highlight emphasis words in yellow
  const parts = text.split(/(\s+)/).map((word, i) => {
    const clean = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const isEm = emphasis.some(e => e.toLowerCase() === clean);
    return (
      <span key={i} style={{ color: isEm ? C.yellow : C.white }}>
        {word}
      </span>
    );
  });

  return (
    <div style={{
      opacity: p,
      transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
      fontFamily: textStyle === 'hook' || textStyle === 'cta'
        ? "'Arial Black', Impact, sans-serif"
        : "'Inter', Arial, sans-serif",
      fontWeight: textStyle === 'hook' || textStyle === 'cta' ? 900 : 700,
      fontSize,
      lineHeight: 1.15,
      textTransform: textStyle === 'hook' || textStyle === 'cta' ? 'uppercase' : 'none',
      letterSpacing: textStyle === 'hook' ? '-1.5px' : '-0.5px',
      textShadow: '0 2px 20px rgba(0,0,0,0.9), 3px 3px 0 rgba(0,0,0,0.4)',
      maxWidth: isVertical ? '90%' : '55%',
    }}>
      {parts}
    </div>
  );
};

// ── Talking head video player (SadTalker output) ─────────────────────────────
// Full-screen for TikTok (vertical), right-column for YouTube (horizontal).
// Always muted — narration audio comes from the top-level <Audio> track only.
const TalkingHeadPlayer: React.FC<{
  src: string;
  isVertical: boolean;
}> = ({ src, isVertical }) => {
  if (isVertical) {
    // TikTok: talking head fills full screen, gradient overlay at top/bottom for text legibility
    return (
      <AbsoluteFill style={{ zIndex: 1 }}>
        <OffthreadVideo
          src={staticFile(src)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          volume={0}
        />
        {/* Dark gradient at top for text */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)',
        }} />
        {/* Dark gradient at bottom for caption text */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
        }} />
      </AbsoluteFill>
    );
  }
  // YouTube: talking head on right 40%, fills column
  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: '42%',
      overflow: 'hidden', zIndex: 2,
    }}>
      <OffthreadVideo
        src={staticFile(src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        volume={0}
      />
    </div>
  );
};

// ── Single scene renderer ─────────────────────────────────────────────────────
const SceneRenderer: React.FC<{
  scene: SceneSpec;
  assets: AssetMap;
  isVertical: boolean;
  totalFrames: number;
}> = ({ scene, assets, isVertical, totalFrames }) => {
  const frame = useCurrentFrame();
  const bgVideoPath = assets.backgroundVideos?.[scene.index];
  const manimPath = scene.showDiagram ? assets.manimVideos?.[scene.index] : null;
  const talkingHeadPath = assets.talkingHeadVideos?.[scene.index];
  const fps = 30;
  const sceneDurationFrames = Math.round(scene.durationSec * fps);

  return (
    <AbsoluteFill>
      {/* ── Background / character ── */}
      {talkingHeadPath ? (
        // Talking head fills the frame — it IS the background
        <TalkingHeadPlayer src={talkingHeadPath} isVertical={isVertical} />
      ) : scene.bgType === 'veo3_clip' && bgVideoPath ? (
        <AbsoluteFill>
          <OffthreadVideo
            src={staticFile(bgVideoPath)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            volume={0}
          />
          <AbsoluteFill style={{ background: 'rgba(0,0,0,0.45)' }} />
        </AbsoluteFill>
      ) : (
        <DarkBg totalFrames={totalFrames} />
      )}

      {/* ── Static Mike (only when no talking head) ── */}
      {!talkingHeadPath && (isVertical ? (
        <MikeCharacter pose={scene.mikePose} localFrame={frame} scale={1.6} bottom={60} right={-20} />
      ) : (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '38%',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 44,
        }}>
          <MikeCharacter pose={scene.mikePose} localFrame={frame} scale={1.45} bottom={44} left={0} />
        </div>
      ))}

      {/* ── Caption text ── */}
      <div style={{
        position: 'absolute',
        ...(isVertical
          ? (talkingHeadPath
            // Talking head: text in top area so face is visible
            ? { top: 120, left: 0, right: 0, padding: '0 40px', textAlign: 'center' }
            : { bottom: 200, left: 0, right: 0, padding: '0 36px' })
          : { left: 60, top: 0, bottom: 0, width: '58%', display: 'flex', alignItems: 'center', padding: '80px 50px 80px 80px' }
        ),
        zIndex: 30,
      }}>
        <SceneCaption
          text={scene.text}
          emphasis={scene.emphasis}
          textStyle={scene.textStyle}
          isVertical={isVertical}
          localFrame={frame}
        />
      </div>

      {/* ── Manim diagram PiP ── */}
      {manimPath && (
        <ManimPiP
          videoSrc={staticFile(manimPath)}
          position={isVertical ? 'left' : scene.diagramPosition}
          isVertical={isVertical}
          localFrame={frame}
        />
      )}

      {/* ── Brand badge ── */}
      <BrandBadge localFrame={frame} />
      <EKGBar width={isVertical ? 1080 : 1920} />
    </AbsoluteFill>
  );
};

// ── Default demo manifest (shown when no props passed) ────────────────────────
const DEMO_MANIFEST: ProductionManifest = {
  briefId: 'demo',
  channel: 'youtube',
  title: 'SimpleNursing AI Studio',
  totalDurationSec: 15,
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  voice: 'This is the SimpleNursing AI Studio. Approve a brief in Airtable and we produce it automatically.',
  scenes: [
    { index: 0, startSec: 0, durationSec: 5, text: 'SIMPLENURISNG AI STUDIO', mikePose: 'talking', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'hook', emphasis: ['AI', 'STUDIO'] },
    { index: 1, startSec: 5, durationSec: 5, text: 'Approve in Airtable → Video automatically', mikePose: 'pointing', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'fact', emphasis: ['automatically'] },
    { index: 2, startSec: 10, durationSec: 5, text: 'Powered by Veo3 · Imagen4 · Manim · Fish Audio', mikePose: 'celebrate', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'cta', emphasis: ['Veo3', 'Imagen4', 'Manim'] },
  ],
  thumbnail: { prompt: 'SimpleNursing AI Studio educational video thumbnail' },
};

const DEMO_ASSETS: AssetMap = {
  voicePath: null,
  manimVideos: {},
  backgroundVideos: {},
};

// ── Root composition ──────────────────────────────────────────────────────────
export const NurseForgeProduction: React.FC<Partial<NurseForgeProps>> = ({
  manifest = DEMO_MANIFEST,
  assets = DEMO_ASSETS,
}) => {
  const { fps } = useVideoConfig();
  const isVertical = manifest.resolution.height > manifest.resolution.width;
  const totalFrames = Math.round(manifest.totalDurationSec * (manifest.fps || 30));

  return (
    <AbsoluteFill style={{ fontFamily: "'Inter', 'Arial Black', Arial, sans-serif" }}>
      <DarkBg totalFrames={totalFrames} />

      {assets.voicePath && (
        <Audio src={staticFile(assets.voicePath)} volume={1} />
      )}

      {manifest.scenes.map(scene => {
        const startFrame = Math.round(scene.startSec * fps);
        const durationFrames = Math.round(scene.durationSec * fps);
        return (
          <Sequence
            key={scene.index}
            from={startFrame}
            durationInFrames={durationFrames}
            name={`Scene ${scene.index}: ${scene.text.slice(0, 30)}`}
          >
            <SceneRenderer
              scene={scene}
              assets={assets}
              isVertical={isVertical}
              totalFrames={totalFrames}
            />
          </Sequence>
        );
      })}

      {/* SimpleNursing logo — always on top, every video */}
      <div style={{
        position: 'absolute',
        top: isVertical ? 28 : 20,
        left: isVertical ? 28 : 32,
        zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        borderRadius: 12,
        padding: isVertical ? '8px 18px' : '6px 14px',
        backdropFilter: 'blur(8px)',
      }}>
        <Img
          src={staticFile('simplenursing-logo.png')}
          style={{ height: isVertical ? 36 : 28, width: 'auto', display: 'block' }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const NURSE_FORGE_FRAMES = (m: ProductionManifest) =>
  Math.round(m.totalDurationSec * (m.fps || 30));

// Dynamic frame count from manifest props — used by Root.tsx calculateMetadata
export const calculateMetadata: CalculateMetadataFunction<Partial<NurseForgeProps>> = ({ props }) => {
  const manifest = props.manifest ?? DEMO_MANIFEST;
  const fps = manifest.fps || 30;
  const durationInFrames = Math.round(manifest.totalDurationSec * fps);
  const { width, height } = manifest.resolution;
  return { durationInFrames, fps, width, height };
};

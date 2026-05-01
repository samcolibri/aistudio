/**
 * VideoEditorComposition — Adobe-style live editor for AI-produced videos
 *
 * Load any AI-generated video from public/ai-videos/ and layer:
 *  - Animated captions with spring physics slide-in
 *  - Brand text overlays (SimpleNursing colors)
 *  - Watermark / channel tag
 *  - Intro title card
 *  - Outro CTA
 *
 * Edit props in Remotion Studio → see changes live → render to MP4.
 */
import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
  staticFile,
} from 'remotion';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Caption {
  startSec: number;
  endSec: number;
  text: string;
}

export interface VideoEditorProps {
  videoSrc: string;
  audioSrc?: string;
  title: string;
  channel: 'tiktok' | 'instagram' | 'youtube' | 'pinterest';
  captions: Caption[];
  showLogo: boolean;
  showCaptions: boolean;
  showTitle: boolean;
  showOutro: boolean;
  accentColor: string;
  overlayText: string;
  ctaText: string;
}

export const DEFAULT_TALKING_HEAD: VideoEditorProps = {
  videoSrc: 'ai-videos/student_omnihuman_qt.mp4',
  audioSrc: '',
  title: '9 Classes That Get You Into Nursing School',
  channel: 'tiktok',
  accentColor: '#fc3467',
  showLogo: true,
  showCaptions: true,
  showTitle: true,
  showOutro: true,
  overlayText: 'TAKE THESE 9 CLASSES',
  ctaText: 'simplenursing.com/prereqs',
  captions: [
    { startSec: 0.5, endSec: 4.5, text: 'Before you apply to nursing school...' },
    { startSec: 5.0, endSec: 9.5, text: 'You need THESE 9 prereq classes.' },
    { startSec: 10.0, endSec: 14.5, text: 'Missing even ONE delays your admission.' },
    { startSec: 15.0, endSec: 19.5, text: 'Biology · Chemistry · A&P I + II' },
    { startSec: 20.0, endSec: 24.0, text: 'Get the full list → simplenursing.com' },
  ],
};

export const DEFAULT_VEOTRACK: VideoEditorProps = {
  ...DEFAULT_TALKING_HEAD,
  videoSrc: 'ai-videos/veo3_final.mp4',
  title: 'Nursing School Prereqs — Full Walkthrough',
  channel: 'youtube',
  accentColor: '#00709c',
  overlayText: 'YOUR NURSING ROADMAP',
  ctaText: 'Subscribe for nursing prep tips',
  captions: [
    { startSec: 0.5, endSec: 5, text: 'Nursing school starts BEFORE nursing school.' },
    { startSec: 6, endSec: 11, text: 'Here are the 9 prereq classes most programs require.' },
    { startSec: 12, endSec: 17, text: 'Anatomy & Physiology takes TWO full semesters.' },
    { startSec: 18, endSec: 23, text: 'Start planning freshman year — not junior year.' },
  ],
};

export const DEFAULT_GOOGLE_DIRECT: VideoEditorProps = {
  ...DEFAULT_TALKING_HEAD,
  videoSrc: 'ai-videos/google_direct_final.mp4',
  title: 'Should I Be a Nurse? — The Real Questions',
  channel: 'tiktok',
  accentColor: '#fc3467',
  overlayText: 'SHOULD YOU BE A NURSE?',
  ctaText: 'Take the quiz → simplenursing.com/quiz',
  captions: [
    { startSec: 0.5, endSec: 5, text: 'Not everyone should be a nurse.' },
    { startSec: 6, endSec: 11, text: 'And that\'s okay. But here\'s how you find out.' },
    { startSec: 12, endSec: 18, text: 'Answer these 10 questions honestly.' },
    { startSec: 19, endSec: 25, text: 'Take the free quiz → simplenursing.com' },
  ],
};

// ── Brand constants ───────────────────────────────────────────────────────────
const SN = {
  teal: '#00709c',
  blue: '#75c7e6',
  pink: '#fc3467',
  yellow: '#fad74f',
  dark: '#282323',
  navy: '#005374',
};

// ── Sub-components ────────────────────────────────────────────────────────────
function CaptionBar({ caption, fps }: { caption: Caption; fps: number }) {
  const frame = useCurrentFrame();
  const elapsed = frame - caption.startSec * fps;
  const total = (caption.endSec - caption.startSec) * fps;
  const inProgress = spring({ frame: elapsed, fps, config: { damping: 18, mass: 0.35 } });
  const outProgress = interpolate(elapsed, [total - fps * 0.4, total], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${(1 - inProgress) * 30}px)`,
        opacity: inProgress * (1 - outProgress),
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.78)',
          color: 'white',
          padding: '12px 28px',
          borderRadius: 10,
          fontSize: 22,
          fontWeight: 700,
          maxWidth: '82%',
          textAlign: 'center',
          borderLeft: `4px solid ${SN.pink}`,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {caption.text}
      </div>
    </div>
  );
}

function TitleCard({ text, accentColor }: { text: string; accentColor: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 14, mass: 0.4 } });
  return (
    <div
      style={{
        position: 'absolute',
        top: 40,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(${(1 - progress) * -50}px)`,
        opacity: progress,
      }}
    >
      <div
        style={{
          background: accentColor,
          color: 'white',
          padding: '10px 30px',
          borderRadius: 8,
          fontSize: 22,
          fontWeight: 900,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Watermark({ ctaText }: { ctaText: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.015;
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 16,
        background: SN.dark,
        padding: '6px 14px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        transform: `scale(${pulse})`,
      }}
    >
      <span style={{ color: SN.yellow, fontWeight: 900, fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif' }}>
        SimpleNursing
      </span>
    </div>
  );
}

function ChannelTag({ channel, accentColor }: { channel: string; accentColor: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: accentColor,
        color: 'white',
        padding: '4px 14px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {channel}
    </div>
  );
}

function OutroCard({ ctaText, accentColor }: { ctaText: string; accentColor: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 12, mass: 0.5 } });
  return (
    <AbsoluteFill style={{ background: SN.dark, opacity: progress }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 20,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            color: SN.yellow,
            fontSize: 48,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: 2,
            transform: `scale(${progress})`,
          }}
        >
          SimpleNursing
        </div>
        <div
          style={{
            background: accentColor,
            color: 'white',
            padding: '14px 36px',
            borderRadius: 12,
            fontSize: 22,
            fontWeight: 700,
            transform: `translateY(${(1 - progress) * 30}px)`,
          }}
        >
          {ctaText}
        </div>
        <div style={{ color: SN.blue, fontSize: 16 }}>simplenursing.com</div>
      </div>
    </AbsoluteFill>
  );
}

// ── Main composition ──────────────────────────────────────────────────────────
export const VideoEditorComposition: React.FC<VideoEditorProps> = ({
  videoSrc,
  audioSrc,
  title,
  channel,
  captions,
  showLogo,
  showCaptions,
  showTitle,
  showOutro,
  accentColor,
  overlayText,
  ctaText,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Global fade in (first 0.3s) and fade out (last 0.5s)
  const fadeIn = interpolate(frame, [0, fps * 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [durationInFrames - fps * 0.5, durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const globalOpacity = Math.min(fadeIn, fadeOut);

  // Outro starts at last 3s
  const outroDurationFrames = fps * 3;
  const outroStart = durationInFrames - outroDurationFrames;
  const mainDuration = durationInFrames - outroDurationFrames;

  // Active caption
  const activeCaption = showCaptions
    ? captions.find(c => frame >= c.startSec * fps && frame < c.endSec * fps)
    : undefined;

  return (
    <AbsoluteFill style={{ opacity: globalOpacity }}>
      {/* ── Base AI video ── */}
      <Sequence durationInFrames={mainDuration}>
        <OffthreadVideo
          src={staticFile(videoSrc)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </Sequence>

      {/* ── Optional audio track override ── */}
      {audioSrc && (
        <Audio src={staticFile(audioSrc)} />
      )}

      {/* ── Title card (first 3s) ── */}
      {showTitle && overlayText && (
        <Sequence durationInFrames={fps * 3}>
          <TitleCard text={overlayText} accentColor={accentColor} />
        </Sequence>
      )}

      {/* ── Live captions ── */}
      {activeCaption && (
        <CaptionBar caption={activeCaption} fps={fps} />
      )}

      {/* ── Channel tag (always visible) ── */}
      <ChannelTag channel={channel} accentColor={accentColor} />

      {/* ── Watermark ── */}
      {showLogo && <Watermark ctaText={ctaText} />}

      {/* ── Outro CTA (last 3s) ── */}
      {showOutro && (
        <Sequence from={outroStart} durationInFrames={outroDurationFrames}>
          <OutroCard ctaText={ctaText} accentColor={accentColor} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};

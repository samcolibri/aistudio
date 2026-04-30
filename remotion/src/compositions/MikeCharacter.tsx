import React, { useState, useEffect } from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, delayRender, continueRender } from 'remotion';

export type MikePose = 'talking' | 'pointing' | 'open_arms' | 'celebrate' | 'sad' | 'idle';

// Import PNG poses as webpack bundled assets — avoids HTTP serving issues in headless mode
// @ts-ignore
import talkingPng from '../../public/mike_svg_1.png';
// @ts-ignore
import pointingPng from '../../public/mike_svg_2.png';
// @ts-ignore
import openArmsPng from '../../public/mike_svg_3.png';
// @ts-ignore
import celebratePng from '../../public/mike_svg_4.png';
// @ts-ignore
import sadPng from '../../public/mike_svg_5.png';
// @ts-ignore
import idlePng from '../../public/mike_svg_6.png';

const POSE_SRCS: Record<MikePose, string> = {
  talking:   talkingPng,
  pointing:  pointingPng,
  open_arms: openArmsPng,
  celebrate: celebratePng,
  sad:       sadPng,
  idle:      idlePng,
};

interface MikeCharacterProps {
  pose?: MikePose;
  localFrame?: number;
  scale?: number;
  bottom?: number | string;
  right?: number | string;
  left?: number | string;
  flip?: boolean;
}

export const MikeCharacter: React.FC<MikeCharacterProps> = ({
  pose = 'idle', localFrame, scale = 1,
  bottom = 0, right, left, flip = false,
}) => {
  const frame = localFrame ?? useCurrentFrame();
  const { fps } = useVideoConfig();

  const entryP = spring({ frame, fps, config: { damping: 14, stiffness: 120 }, durationInFrames: 28 });
  const entryY = interpolate(entryP, [0, 1], [180, 0]);
  const punchS = spring({ frame, fps, config: { damping: 7, stiffness: 280 }, durationInFrames: 10 });
  const punch  = interpolate(punchS, [0, 0.6, 1], [0.8, 1.08, 1.0]);

  let bob = 0, sway = 0, tilt = 0;
  switch (pose) {
    case 'idle':
    case 'talking':
      bob  = Math.sin(frame / 10) * 7;
      sway = Math.sin(frame / 15) * 2;
      tilt = sway * 0.5;
      break;
    case 'pointing':
      bob  = Math.sin(frame / 24) * 3;
      sway = interpolate(Math.min(frame, 15), [0, 15], [0, -8]);
      tilt = -3;
      break;
    case 'open_arms':
      bob  = Math.sin(frame / 18) * 5;
      sway = Math.sin(frame / 26) * 3;
      tilt = sway * 0.3;
      break;
    case 'celebrate':
      bob  = Math.abs(Math.sin(frame / 8)) * -14;
      sway = Math.sin(frame / 8) * 5;
      tilt = sway * 0.9;
      break;
    case 'sad':
      bob  = Math.sin(frame / 30) * 3 + 8;
      sway = Math.sin(frame / 38) * 1.5;
      tilt = 10 + Math.sin(frame / 35) * 2;
      break;
  }

  const src = POSE_SRCS[pose];

  return (
    <div style={{
      position: 'absolute', bottom,
      ...(right !== undefined ? { right } : {}),
      ...(left  !== undefined ? { left  } : {}),
      width: 340, pointerEvents: 'none', zIndex: 20,
      transform: [
        `translateY(${entryY + bob}px)`,
        `translateX(${sway}px)`,
        `rotate(${tilt}deg)`,
        `scale(${(flip ? -1 : 1) * scale * punch}, ${scale * punch})`,
      ].join(' '),
      transformOrigin: 'bottom center',
    }}>
      {src ? (
        <img src={src} style={{ width: '100%', height: 'auto', display: 'block' }} alt="" />
      ) : (
        // Fallback: colored placeholder if no image
        <div style={{
          width: '100%', height: 400,
          background: 'linear-gradient(180deg, #00709c 0%, #75c7e6 100%)',
          borderRadius: '50% 50% 0 0',
          opacity: 0.8,
        }} />
      )}
    </div>
  );
};

interface MikePoseTimelineProps extends Omit<MikeCharacterProps, 'pose'> {
  timeline: [number, MikePose][];
}

export const MikePoseTimeline: React.FC<MikePoseTimelineProps> = ({ timeline, ...rest }) => {
  const frame = useCurrentFrame();
  let currentPose: MikePose = 'idle';
  for (const [start, pose] of timeline) {
    if (frame >= start) currentPose = pose;
  }
  return <MikeCharacter {...rest} pose={currentPose} localFrame={frame} />;
};

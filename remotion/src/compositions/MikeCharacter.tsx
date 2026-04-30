import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig, Img, staticFile } from 'remotion';

export type MikePose = 'talking' | 'pointing' | 'open_arms' | 'celebrate' | 'sad' | 'idle';

const POSE_FILES: Record<MikePose, string> = {
  talking:   'mike_pose1_t.png',
  pointing:  'mike_pose2_t.png',
  open_arms: 'mike_pose3_t.png',
  celebrate: 'mike_pose4_t.png',
  sad:       'mike_pose5_t.png',
  idle:      'mike_pose1_t.png',
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
      <Img src={staticFile(POSE_FILES[pose])} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  );
};

interface MikePoseTimelineProps extends Omit<MikeCharacterProps, 'pose'> {
  timeline: [number, MikePose][];
}

export const MikePoseTimeline: React.FC<MikePoseTimelineProps> = ({ timeline, ...rest }) => {
  const frame = useCurrentFrame();
  let activePose: MikePose = timeline[0]?.[1] ?? 'idle';
  let poseStart = 0;
  for (const [start, pose] of timeline) {
    if (frame >= start) { activePose = pose; poseStart = start; }
  }
  return <MikeCharacter {...rest} pose={activePose} localFrame={frame - poseStart} />;
};

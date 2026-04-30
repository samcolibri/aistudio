import React from 'react';
import { Composition } from 'remotion';
import { TikTok, TikTokProps } from './compositions/TikTok';
import { Instagram, InstagramProps } from './compositions/Instagram';
import { Pinterest, PinterestProps } from './compositions/Pinterest';
import { YouTube, YouTubeProps } from './compositions/YouTube';
import { NursingVideoTikTok } from './compositions/NursingVideoTikTok';
import { NurseMikeYouTube, NURSE_MIKE_YOUTUBE_FRAMES } from './compositions/NurseMikeYouTube';
import { NurseForgeProduction, NURSE_FORGE_FRAMES, calculateMetadata as forgeCalculateMetadata } from './compositions/NurseForgeProduction';
import type { ProductionManifest, AssetMap } from './compositions/NurseForgeProduction';

const DEFAULT_TIKTOK: TikTokProps = {
  title: '9 Classes That Get You Into Nursing School',
  hookLine: 'TAKE THESE 9 CLASSES BEFORE YOU APPLY',
  hookSubline: 'Missing even one can delay your admission by a full semester.',
  items: [
    'Biology', 'Chemistry', 'Anatomy & Physiology I',
    'Anatomy & Physiology II', 'Statistics', 'Microbiology',
    'English Composition', 'Psychology', 'Nutrition',
  ],
  ctaLine: 'PLAN YOUR PREREQS NOW',
  stat: 'Most programs require all 9 — start freshman year.',
};

const DEFAULT_INSTAGRAM: InstagramProps = {
  title: 'Timeline Reality: How Long Nursing Prereqs Actually Take',
  slides: [
    { type: 'hook', headline: 'PREREQS TAKE LONGER THAN YOU THINK', body: 'Here\'s exactly how to plan your timeline.' },
    { type: 'item', headline: 'Start freshman year', body: 'Biology and Chemistry first — they\'re prereqs FOR the prereqs.', itemNumber: 1, accentColor: '#00709c' },
    { type: 'item', headline: '4 semesters minimum', body: 'A&P I, A&P II, Microbiology, Statistics — can\'t rush these.', itemNumber: 2, accentColor: '#fc3467' },
    { type: 'item', headline: 'Apply 1 year early', body: 'Competitive programs fill fast. Submit apps junior year.', itemNumber: 3, accentColor: '#62d070' },
    { type: 'cta', headline: 'Map your full timeline at simplenursing.com — takes 5 minutes.', type: 'cta' } as any,
  ],
};

const DEFAULT_PINTEREST: PinterestProps = {
  title: 'From High School to RN: Complete Requirements Roadmap',
  hookLine: 'EVERYTHING YOU NEED BEFORE NURSING SCHOOL',
  items: [
    'Biology (with lab)',
    'Chemistry (with lab)',
    'Anatomy & Physiology I + II',
    'Statistics or College Math',
    'Microbiology',
    'English Composition',
    'Psychology',
    'CNA certification (optional but powerful)',
  ],
  ctaLine: 'GET THE FULL ROADMAP',
};

const DEFAULT_YOUTUBE: YouTubeProps = {
  title: '9 Classes That Get You Into Nursing School',
  hookLine: 'MISSING ONE CLASS KILLS YOUR APPLICATION',
  hookSubline: 'Most nursing applicants fail before they ever submit.',
  sections: [
    {
      heading: 'THE SCIENCE PREREQS',
      points: [
        'Biology with lab — non-negotiable at every school',
        'Chemistry — most programs want a C or higher',
        'Anatomy & Physiology I + II — 2 full semesters',
        'Microbiology — typically taken after A&P',
      ],
    },
    {
      heading: 'THE SUPPORT CLASSES',
      points: [
        'Statistics — competitive programs want 3.0 or above',
        'English Composition — writing matters in nursing',
        'Psychology or Sociology — understanding patient behavior',
      ],
    },
  ],
  ctaLine: 'GET THE FULL PREREQ CHECKLIST',
  stat: '94% of RNs say prereqs were harder than nursing school itself',
};

const FORGE_DEMO_MANIFEST: ProductionManifest = {
  briefId: 'demo',
  channel: 'youtube',
  title: 'SimpleNursing AI Studio',
  totalDurationSec: 15,
  fps: 30,
  resolution: { width: 1920, height: 1080 },
  voice: 'This is the SimpleNursing AI Studio. Approve a brief in Airtable and we produce it automatically.',
  scenes: [
    { index: 0, startSec: 0, durationSec: 5, text: 'SIMPLENURSING AI STUDIO', mikePose: 'talking', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'hook', emphasis: ['AI', 'STUDIO'] },
    { index: 1, startSec: 5, durationSec: 5, text: 'Approve in Airtable → Video automatically', mikePose: 'pointing', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'fact', emphasis: ['automatically'] },
    { index: 2, startSec: 10, durationSec: 5, text: 'Powered by Veo3 · Imagen4 · Manim · Fish Audio', mikePose: 'celebrate', bgType: 'animated_dark', bgPrompt: '', showDiagram: false, diagramTopic: '', diagramPosition: 'right', textStyle: 'cta', emphasis: ['Veo3', 'Imagen4', 'Manim'] },
  ],
  thumbnail: { prompt: 'SimpleNursing AI Studio educational video thumbnail' },
};

const FORGE_DEMO_ASSETS: AssetMap = {
  voicePath: null,
  manimVideos: {},
  backgroundVideos: {},
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="NurseForgeProduction"
      component={NurseForgeProduction}
      calculateMetadata={forgeCalculateMetadata}
      durationInFrames={NURSE_FORGE_FRAMES(FORGE_DEMO_MANIFEST)}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ manifest: FORGE_DEMO_MANIFEST, assets: FORGE_DEMO_ASSETS }}
    />
    <Composition
      id="NurseForgeProductionTikTok"
      component={NurseForgeProduction}
      calculateMetadata={forgeCalculateMetadata}
      durationInFrames={NURSE_FORGE_FRAMES({ ...FORGE_DEMO_MANIFEST, resolution: { width: 1080, height: 1920 } })}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        manifest: { ...FORGE_DEMO_MANIFEST, channel: 'tiktok', resolution: { width: 1080, height: 1920 } },
        assets: FORGE_DEMO_ASSETS,
      }}
    />
    <Composition
      id="NurseMikeYouTube"
      component={NurseMikeYouTube}
      durationInFrames={NURSE_MIKE_YOUTUBE_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="NursingVideoTikTok"
      component={NursingVideoTikTok}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="YouTube"
      component={YouTube}
      durationInFrames={810}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={DEFAULT_YOUTUBE}
    />
    <Composition
      id="TikTok"
      component={TikTok}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_TIKTOK}
    />
    <Composition
      id="Instagram"
      component={Instagram}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={DEFAULT_INSTAGRAM}
    />
    <Composition
      id="Pinterest"
      component={Pinterest}
      durationInFrames={240}
      fps={30}
      width={1000}
      height={1500}
      defaultProps={DEFAULT_PINTEREST}
    />
  </>
);

import { registerRoot } from 'remotion';
registerRoot(RemotionRoot);

import type { PersonaId } from '../types/brief.js'
import { VOICE_IDS } from '../client/fish-audio.js'
import { MIKE_CHARACTER } from '../client/google-ai.js'

export interface Persona {
  id: PersonaId
  name: string
  age: string
  role: string
  voiceId: string
  tone: string
  veo3Description: string   // character description for Veo3 prompts
  musicMood: string         // Suno/background music brief
}

export const PERSONAS: Record<PersonaId, Persona> = {
  'nurse-mike': {
    id: 'nurse-mike',
    name: 'Nurse Mike',
    age: '26',
    role: 'ER RN',
    voiceId: VOICE_IDS['nurse-mike'],
    tone: 'conversational, direct, slightly frustrated, honest — nobody told me this',
    veo3Description: MIKE_CHARACTER,
    musicMood: 'calm ambient, slightly tense, educational background, cinematic, no vocals, 3-5 min loop',
  },
  'nurse-alison': {
    id: 'nurse-alison',
    name: 'Nurse Alison',
    age: '32',
    role: 'RN, 4+ years',
    voiceId: VOICE_IDS['nurse-alison'],
    tone: 'warm, direct, practical — like an older sister for career changers',
    veo3Description: [
      'Nurse Alison: a Latina female nurse in her early 30s, wearing dark teal scrubs,',
      'hair pulled back professionally, warm reassuring smile, clean hospital background',
      'with soft warm lighting. Medium close-up, eye-level camera, cinematic quality.',
    ].join(' '),
    musicMood: 'soft warm ambient, reassuring, no vocals, 3-5 min loop',
  },
  'jordan': {
    id: 'jordan',
    name: 'Jordan',
    age: '17-18',
    role: 'High school senior, pre-nursing',
    voiceId: VOICE_IDS['jordan'],
    tone: 'bubbly, relatable, fear-focused — am I smart enough?',
    veo3Description: [
      'Jordan: an 18-year-old Black female student, casual outfit, studying at a desk',
      'or speaking directly to camera in bedroom setting. Bright natural lighting, authentic Gen Z aesthetic.',
      'Expressive, relatable, TikTok-native style. Vertical 9:16 format.',
    ].join(' '),
    musicMood: 'upbeat casual TikTok lo-fi, energetic, no vocals, 30-60s',
  },
  'priya': {
    id: 'priya',
    name: 'Priya',
    age: '19-22',
    role: 'College student, nursing track',
    voiceId: VOICE_IDS['priya'],
    tone: 'fast-talking, confessional voice-memo vibe — okay so',
    veo3Description: [
      'Priya: a South Asian female college student, 20 years old, casual campus attire,',
      'speaking to camera in dorm or campus setting. Natural lighting, authentic and unfiltered aesthetic.',
      'Fast confident energy, TikTok-native. Vertical 9:16.',
    ].join(' '),
    musicMood: 'minimal lo-fi study vibe, soft beats, no vocals, 30-60s',
  },
  'aaliyah': {
    id: 'aaliyah',
    name: 'Aaliyah',
    age: '20',
    role: 'Nursing student, sophomore',
    voiceId: VOICE_IDS['aaliyah'],
    tone: 'authentic, documenting the journey — real and unfiltered',
    veo3Description: [
      'Aaliyah: a Black female nursing student, 20 years old, wearing nursing student scrubs,',
      'speaking to camera in study area or clinical hallway. Documentary-style authentic lighting.',
      'Genuine, relatable, not overly polished. Vertical 9:16.',
    ].join(' '),
    musicMood: 'chill lo-fi authentic, no vocals, 30-60s',
  },
  'dana': {
    id: 'dana',
    name: 'Dana',
    age: '27',
    role: 'Career changer, ROI-focused',
    voiceId: VOICE_IDS['dana'],
    tone: 'analytical, respects your time and money, ROI-focused',
    veo3Description: [
      'Dana: a female career changer in her late 20s, business casual attire,',
      'speaking to camera in a clean home office or minimal setting.',
      'Professional, confident, YouTube talking-head style. 16:9.',
    ].join(' '),
    musicMood: 'neutral professional ambient, calm, no vocals, 3-5 min',
  },
}

export function getPersona(id: PersonaId): Persona {
  const p = PERSONAS[id]
  if (!p) throw new Error(`Unknown persona: ${id}`)
  return p
}

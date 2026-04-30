import type { PersonaId, Channel, AspectRatio } from '../types/brief.js'

export interface Persona {
  id: PersonaId
  name: string
  age: string
  role: string
  channels: Channel[]
  aspectRatio: AspectRatio
  voiceId: string              // Fish Audio reference_id or ElevenLabs voice_id
  voiceProvider: 'fish-audio' | 'elevenlabs'
  tone: string
  hooks: string[]              // Signature openings for this persona
  characterImageUrl: string    // Nurse Mike / character avatar for Kling lip-sync
  musicMood: string            // Suno music prompt suffix per persona
}

export const PERSONAS: Record<PersonaId, Persona> = {
  'nurse-mike': {
    id: 'nurse-mike',
    name: 'Nurse Mike',
    age: '26',
    role: 'ER RN',
    channels: ['youtube'],
    aspectRatio: '16:9',
    voiceId: 'nurse_mike_v2',
    voiceProvider: 'fish-audio',
    tone: 'conversational, direct, slightly frustrated, honest — "nobody told me this"',
    hooks: [
      'I spent 3 years in nursing school and nobody told me',
      'Here\'s what the NCLEX prep courses will never say',
      'Most nursing students fail because of this one thing',
      'I learned this the hard way in the ER',
    ],
    characterImageUrl: process.env.NURSE_MIKE_IMAGE_URL || '',
    musicMood: 'calm ambient, slightly tense, educational background, no vocals',
  },
  'nurse-alison': {
    id: 'nurse-alison',
    name: 'Nurse Alison',
    age: '32',
    role: 'RN, 4+ years',
    channels: ['youtube'],
    aspectRatio: '16:9',
    voiceId: 'nurse_alison_v1',
    voiceProvider: 'fish-audio',
    tone: 'warm, direct, like an older sister — practical, no-nonsense for career changers',
    hooks: [
      'As someone who\'s been through it, let me save you the stress',
      'Four years in and I\'m still surprised nobody talks about this',
    ],
    characterImageUrl: process.env.NURSE_ALISON_IMAGE_URL || '',
    musicMood: 'soft warm ambient, reassuring, no vocals',
  },
  'jordan': {
    id: 'jordan',
    name: 'Jordan',
    age: '17-18',
    role: 'High school junior, pre-nursing',
    channels: ['tiktok', 'instagram'],
    aspectRatio: '9:16',
    voiceId: 'jordan_v1',
    voiceProvider: 'fish-audio',
    tone: 'bubbly, relatable, fear-focused — what disqualifies me, am I smart enough',
    hooks: [
      'POV: you want to be a nurse but don\'t know where to start',
      'Nobody tells you this before you apply to nursing school',
      'I almost didn\'t apply because of this',
    ],
    characterImageUrl: process.env.JORDAN_IMAGE_URL || '',
    musicMood: 'upbeat casual, TikTok-style lo-fi, energetic',
  },
  'priya': {
    id: 'priya',
    name: 'Priya',
    age: '19-22',
    role: 'College student, nursing track',
    channels: ['tiktok'],
    aspectRatio: '9:16',
    voiceId: 'priya_v1',
    voiceProvider: 'fish-audio',
    tone: 'fast-talking, confessional, voice-memo vibe — "okay so"',
    hooks: [
      'Okay so this is something they don\'t put in the syllabus',
      'My nursing professor would probably kill me for saying this',
      'The thing about nursing school that changed everything for me',
    ],
    characterImageUrl: process.env.PRIYA_IMAGE_URL || '',
    musicMood: 'minimal lo-fi, study vibe, soft beats',
  },
  'aaliyah': {
    id: 'aaliyah',
    name: 'Aaliyah',
    age: '20',
    role: 'Nursing student, sophomore',
    channels: ['tiktok', 'instagram'],
    aspectRatio: '9:16',
    voiceId: 'aaliyah_v1',
    voiceProvider: 'fish-audio',
    tone: 'authentic, relatable, documenting the journey',
    hooks: [
      'Week 2 of nursing school and I\'m already questioning everything',
      'Things I wish someone told me before semester 2',
    ],
    characterImageUrl: process.env.AALIYAH_IMAGE_URL || '',
    musicMood: 'chill lo-fi, authentic, no vocals',
  },
  'dana': {
    id: 'dana',
    name: 'Dana',
    age: '25+',
    role: 'Career changer, ROI-focused',
    channels: ['youtube'],
    aspectRatio: '16:9',
    voiceId: 'dana_v1',
    voiceProvider: 'fish-audio',
    tone: 'analytical, ROI-focused, respects the audience\'s time and money',
    hooks: [
      'I ran the numbers before switching to nursing and here\'s what I found',
      'Career changers need to hear this before spending $40K on nursing school',
      'What nursing school brochures won\'t tell you about the salary',
    ],
    characterImageUrl: process.env.DANA_IMAGE_URL || '',
    musicMood: 'neutral professional, calm corporate ambient',
  },
}

export function getPersona(id: PersonaId): Persona {
  const p = PERSONAS[id]
  if (!p) throw new Error(`Unknown persona: ${id}`)
  return p
}

export function getMusicPrompt(persona: Persona, channel: string): string {
  const base = `${persona.musicMood}, instrumental only, seamless loop`
  return channel === 'youtube'
    ? `${base}, 3-5 minutes, educational documentary feel`
    : `${base}, 30-60 seconds, high energy intro`
}

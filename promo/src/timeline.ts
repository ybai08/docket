import type { ComponentType } from 'react';

import { Area, Close, FiledOrFake, Friends, Hook, Landslide, Nationwide, Privacy, Profile, Records, RollCall, Today } from './Scenes';

/** Music tempo for the music-only cut (scripts/music.mjs). The voiceover cut sizes scenes to the voiceover instead. */
export const BPM = 120;
export const BAR_FRAMES = 60;

/**
 * Scene order and length in frames at 30 fps. Neighbors overlap by TRANSITION frames, so a scene of
 * BARS * 60 + TRANSITION frames makes the next one start exactly on a bar line, where the music's
 * drops and fills land (see scripts/music.mjs).
 */
export const SCENES: { id: string; component: ComponentType; frames: number }[] = [
  { id: 'hook', component: Hook, frames: 328 },
  { id: 'today', component: Today, frames: 397 },
  { id: 'roll-call', component: RollCall, frames: 334 },
  { id: 'filed-or-fake', component: FiledOrFake, frames: 428 },
  { id: 'landslide', component: Landslide, frames: 279 },
  { id: 'friends', component: Friends, frames: 321 },
  { id: 'area', component: Area, frames: 256 },
  { id: 'profile', component: Profile, frames: 207 },
  { id: 'records', component: Records, frames: 270 },
  { id: 'nationwide', component: Nationwide, frames: 216 },
  { id: 'privacy', component: Privacy, frames: 245 },
  { id: 'close', component: Close, frames: 152 },
];

export const TRANSITION = 16;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0) - TRANSITION * (SCENES.length - 1);

/**
 * The under-a-minute cut (58 s) for the launch page: hook, the three games, friends, bills and
 * lawmakers, every state, end card. Scenes are whole bars at 120 bpm so the cuts land on the beat.
 * Its music (public/music-short.mp3) is an ACE-Step 1.5 track made with the bg-music skill at
 * 120 bpm; its drop lands at 8 s, where the first game starts. The older synthesized version is
 * public/music-short-synth.mp3 (`scripts/music.sh 58 short`).
 */
const bars = (n: number, last = false) => n * BAR_FRAMES + (last ? 0 : TRANSITION);
export const SHORT_SCENES: { id: string; component: ComponentType; frames: number }[] = [
  { id: 'hook', component: Hook, frames: bars(4) },
  { id: 'roll-call', component: RollCall, frames: bars(4) },
  { id: 'filed-or-fake', component: FiledOrFake, frames: bars(4) },
  { id: 'landslide', component: Landslide, frames: bars(3) },
  { id: 'friends', component: Friends, frames: bars(5) },
  { id: 'records', component: Records, frames: bars(3) },
  { id: 'nationwide', component: Nationwide, frames: bars(3) },
  { id: 'close', component: Close, frames: bars(3, true) },
];

export const SHORT_FRAMES = SHORT_SCENES.reduce((n, s) => n + s.frames, 0) - TRANSITION * (SHORT_SCENES.length - 1);


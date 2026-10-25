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

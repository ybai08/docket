import type { ComponentType } from 'react';

import { Area, Close, FiledOrFake, Friends, Hook, Landslide, Nationwide, Privacy, Profile, Records, RollCall, Today } from './Scenes';

/** Scene order and length in frames at 30 fps. Neighbors overlap by TRANSITION frames. */
export const SCENES: { id: string; component: ComponentType; frames: number }[] = [
  { id: 'hook', component: Hook, frames: 225 },
  { id: 'today', component: Today, frames: 270 },
  { id: 'roll-call', component: RollCall, frames: 430 },
  { id: 'filed-or-fake', component: FiledOrFake, frames: 380 },
  { id: 'landslide', component: Landslide, frames: 330 },
  { id: 'friends', component: Friends, frames: 390 },
  { id: 'area', component: Area, frames: 300 },
  { id: 'profile', component: Profile, frames: 360 },
  { id: 'records', component: Records, frames: 360 },
  { id: 'nationwide', component: Nationwide, frames: 240 },
  { id: 'privacy', component: Privacy, frames: 250 },
  { id: 'close', component: Close, frames: 240 },
];

export const TRANSITION = 16;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0) - TRANSITION * (SCENES.length - 1);

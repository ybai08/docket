import type { ComponentType } from 'react';

import { Area, Close, FiledOrFake, Friends, Hook, Landslide, Nationwide, Privacy, Profile, Records, RollCall, Today } from './Scenes';

/** Scene order and length in frames at 30 fps. Neighbors overlap by TRANSITION frames. */
export const SCENES: { id: string; component: ComponentType; frames: number }[] = [
  { id: 'hook', component: Hook, frames: 210 },
  { id: 'today', component: Today, frames: 225 },
  { id: 'roll-call', component: RollCall, frames: 400 },
  { id: 'filed-or-fake', component: FiledOrFake, frames: 350 },
  { id: 'landslide', component: Landslide, frames: 300 },
  { id: 'friends', component: Friends, frames: 470 },
  { id: 'area', component: Area, frames: 280 },
  { id: 'profile', component: Profile, frames: 330 },
  { id: 'records', component: Records, frames: 330 },
  { id: 'nationwide', component: Nationwide, frames: 210 },
  { id: 'privacy', component: Privacy, frames: 230 },
  { id: 'close', component: Close, frames: 210 },
];

export const TRANSITION = 16;

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0) - TRANSITION * (SCENES.length - 1);

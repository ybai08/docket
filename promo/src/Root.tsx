import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Fragment } from 'react';
import { AbsoluteFill, Composition } from 'remotion';

import { SafeZone } from './components';
import { SCENES, TOTAL_FRAMES, TRANSITION } from './timeline';
import { FPS, H, W } from './theme';

type Props = { showSafeZone: boolean };

function DocketDemo({ showSafeZone }: Props) {
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      <TransitionSeries>
        {SCENES.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 && <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: TRANSITION })} />}
            <TransitionSeries.Sequence durationInFrames={s.frames}>
              <s.component />
            </TransitionSeries.Sequence>
          </Fragment>
        ))}
      </TransitionSeries>
      {showSafeZone && <SafeZone />}
    </AbsoluteFill>
  );
}

export function Root() {
  return (
    <Composition
      id="DocketDemo"
      component={DocketDemo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ showSafeZone: false }}
    />
  );
}

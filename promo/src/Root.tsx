import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Fragment } from 'react';
import { AbsoluteFill, Audio, Composition, interpolate, staticFile } from 'remotion';

import { SafeZone } from './components';
import { SCENES, TOTAL_FRAMES, TRANSITION } from './timeline';
import { FPS, H, W } from './theme';

type Props = { showSafeZone: boolean; music: boolean };

function DocketDemo({ showSafeZone, music }: Props) {
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
      {music && (
        // Composed in scripts/music.mjs, so it is royalty-free. Fades out over the last two seconds.
        <Audio
          src={staticFile('music.mp3')}
          volume={(f) => interpolate(f, [TOTAL_FRAMES - 60, TOTAL_FRAMES], [0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      )}
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
      defaultProps={{ showSafeZone: false, music: true }}
    />
  );
}

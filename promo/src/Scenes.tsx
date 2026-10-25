import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { Background, Callout, Copy, Phone, Rise, SCREEN_W, Screens, Stamp, Tap, Tiles, Wordmark, useEnter } from './components';
import { C, sans, serif } from './theme';

// Phone screen points are app points: the screenshots are 402pt wide, shown at 400px.
const pt = (fraction: number, size: number) => fraction * size;

function Words({ text, delay, size, color = C.ink, highlight }: { text: string; delay: number; size: number; color?: string; highlight?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: size * 0.26 }}>
      {text.split(' ').map((w, i) => {
        const t = spring({ frame: frame - delay - i * 3, fps, config: { damping: 16, mass: 0.7 } });
        const marked = highlight && w.replace(/[^\w]/g, '') === highlight;
        return (
          <span
            key={i}
            style={{
              fontFamily: serif,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.12,
              letterSpacing: -size * 0.02,
              color,
              opacity: t,
              transform: `translateY(${(1 - t) * size * 0.45}px)`,
              display: 'inline-block',
              backgroundImage: marked ? `linear-gradient(${C.teal}, ${C.teal})` : undefined,
              backgroundSize: marked ? `100% ${Math.min(1, Math.max(0, (frame - delay - 20) / 12)) * 38}%` : undefined,
              backgroundPosition: '0 88%',
              backgroundRepeat: 'no-repeat',
            }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

export function Hook() {
  const frame = useCurrentFrame();
  const first = interpolate(frame, [62, 74], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const second = interpolate(frame, [106, 116], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }}>
        <div style={{ position: 'absolute', width: 1500, top: 330, opacity: first, transform: `translateY(${(1 - first) * -30}px)` }}>
          <Words text="Every week, lawmakers vote on bills that shape your life." delay={2} size={92} />
        </div>
        {frame >= 70 && (
          <div style={{ position: 'absolute', width: 1500, top: 380, opacity: second, transform: `translateY(${(1 - second) * -30}px)` }}>
            <Words text="Do you know how yours voted?" delay={72} size={112} highlight="yours" />
          </div>
        )}
        {frame >= 114 && (
          <div style={{ position: 'absolute', top: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
            <Wordmark size={200} delay={117} />
            <Tiles delay={127} size={34} gap={14} />
            <Rise delay={141}>
              <div style={{ fontFamily: sans, fontSize: 34, color: C.text2 }}>Three daily games about real bills.</div>
            </Rise>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function Today() {
  return (
    <AbsoluteFill>
      <Background tint={C.yellow} />
      <Copy label="Today's ballot" color={C.yellow} title="A ballot a day." body="Three quick games, all built on real bills. Tap your streak to see your week." />
      <Phone>
        <Screens
          shots={[
            { src: 'today', at: 0 },
            { src: 'streak', at: 128 },
          ]}
        />
        <Tap x={pt(0.9, SCREEN_W)} y={pt(0.118, 870)} at={112} />
      </Phone>
      <Callout label="Today's ballot" value="3 games" sub="Roll Call, Filed or Fake and Landslide" color={C.yellow} at={30} outAt={118} />
      <Callout label="Your streak" value="4 days" sub="Play every day to keep it going. Best: 10" color={C.yellow} at={140} />
    </AbsoluteFill>
  );
}

export function RollCall() {
  const frame = useCurrentFrame();
  const swap = 160;
  // The Yea button and the bill card, as fractions of the screenshot.
  const yea = { x: pt(0.737, SCREEN_W), y: pt(0.881, 870) };
  const stampOut = interpolate(frame, [swap - 10, swap], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      <Background tint={C.lavender} />
      <Copy
        label="01 · Roll Call"
        color={C.lavender}
        title="Vote on real bills."
        body="Five recent bills from Congress and your state legislature. Yea or Nay?"
        outAt={swap - 12}
      />
      {frame >= swap - 4 && (
        <Copy
          label="01 · Roll Call"
          color={C.lavender}
          title="See if you matched."
          body="Compare your vote with the final result, and see how every chamber voted."
          delay={swap}
        />
      )}
      <Phone>
        <Screens
          shots={[
            { src: 'rollcall', at: 0 },
            { src: 'history', at: swap },
          ]}
        />
        <Tap x={yea.x} y={yea.y} at={45} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: pt(0.47, 870), display: 'flex', justifyContent: 'center', opacity: stampOut }}>
          <Stamp label="YEA" color="#2E8B7E" delay={52} size={46} rotate={-9} />
        </div>
      </Phone>
      <Callout label="Bill 1 of 5" value="SB 6" sub="Grid rules for data centers, from the Texas Senate" color={C.lavender} at={30} outAt={swap - 12} />
      <Callout label="Saturday, October 24" value="4 of 5" sub="votes matched the final result" color={C.teal} at={swap + 14} />
    </AbsoluteFill>
  );
}

function CaptionCard({ origin, text, stamp, stampColor, at }: { origin: string; text: string; stamp: string; stampColor: string; at: number }) {
  const frame = useCurrentFrame();
  const t = useEnter(at, 18);
  const out = interpolate(frame, [at + 92, at + 104], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        position: 'absolute',
        left: 260,
        top: 300,
        width: 1240,
        padding: '44px 52px 56px',
        borderRadius: 22,
        border: `3px solid ${C.ink}`,
        background: C.ground,
        boxShadow: '0 30px 60px rgba(0,0,0,0.08)',
        opacity: t * (1 - out),
        transform: `translateY(${(1 - t) * 40 - out * 30}px) rotate(${(1 - t) * -1.5}deg)`,
      }}>
      <div style={{ fontFamily: sans, fontWeight: 700, fontSize: 24, color: C.meta }}>{origin}</div>
      <div style={{ marginTop: 18, fontFamily: serif, fontWeight: 700, fontSize: 64, lineHeight: 1.12, letterSpacing: -0.8, color: C.ink }}>{text}</div>
      <Stamp label={stamp} color={stampColor} delay={at + 44} size={40} rotate={-7} style={{ position: 'absolute', right: 44, bottom: -34 }} />
    </div>
  );
}

export function FiledOrFake() {
  const frame = useCurrentFrame();
  const phoneAt = 290;
  return (
    <AbsoluteFill>
      <Background tint={frame >= phoneAt ? C.yellow : undefined} />
      {frame < phoneAt + 10 && (
        <>
          <Rise delay={4} outAt={phoneAt - 14} style={{ position: 'absolute', left: 260, top: 200 }}>
            <div style={{ display: 'inline-block', padding: '8px 18px', borderRadius: 999, background: C.yellow, fontFamily: sans, fontWeight: 700, fontSize: 22 }}>
              02 · Filed or Fake
            </div>
          </Rise>
          <CaptionCard
            origin="Texas House, 2025"
            text="Ban modifying or controlling the weather, and make doing it a crime."
            stamp="FILED · HB 1382"
            stampColor={C.ink}
            at={55}
          />
          <CaptionCard origin="Texas House, 2025" text="Name the armadillo the official state lawn ornament." stamp="FAKE" stampColor={C.fakeInk} at={178} />
        </>
      )}
      {frame >= phoneAt && (
        <>
          <Copy
            label="02 · Filed or Fake"
            color={C.yellow}
            title="Real or made up?"
            body="Eight bills in plain English. Some were really filed by lawmakers. Some we made up."
            delay={phoneAt + 4}
          />
          <Phone delay={phoneAt}>
            <Screens shots={[{ src: 'fof-results', at: 0 }]} />
          </Phone>
          <Callout label="Your score" value="4 of 8" sub="3 of today's 8 bills were made up" color={C.yellow} at={phoneAt + 26} />
        </>
      )}
    </AbsoluteFill>
  );
}

const LANDSLIDE = [
  { id: 'SB 785', title: 'Allow new manufactured homes in some city zones', vote: '96–41', margin: 55, yours: 0, real: 2 },
  { id: 'SB 1498', title: 'Allow civil forfeiture of digital currency', vote: '74–65', margin: 9, yours: 1, real: 3 },
  { id: 'SB 984', title: 'Let patients try individualized experimental treatments', vote: '147–0', margin: 147, yours: 2, real: 0 },
  { id: 'SB 1663', title: 'Warn residents faster about groundwater contamination', vote: '111–29', margin: 82, yours: 3, real: 1 },
];

/** Landslide rebuilt from the app's layout, so the reshuffle can animate. */
function LandslideScreen() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ROW = 72;
  const GAP = 8;
  const move = spring({ frame: frame - 90, fps, config: { damping: 17, mass: 0.9 } });
  const reveal = interpolate(frame, [150, 164], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, background: C.ground, fontFamily: sans }}>
      <div style={{ position: 'absolute', top: 16, left: 52, fontWeight: 600, fontSize: 17 }}>9:41</div>
      <div style={{ height: 52, marginTop: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `1px solid ${C.hairline}` }}>
        <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 20 }}>Landslide</span>
      </div>
      <div style={{ padding: '18px 16px 0', textAlign: 'center' }}>
        <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 30, lineHeight: 1.1 }}>Which bill won biggest?</div>
        <div style={{ marginTop: 8, fontSize: 14, color: C.text2 }}>Widest margin on top</div>
      </div>
      <div style={{ position: 'relative', margin: '20px 16px 0', height: 4 * (ROW + GAP) }}>
        {LANDSLIDE.map((b) => {
          const slot = b.yours + (b.real - b.yours) * move;
          const lifted = frame > 96 && frame < 130 && b.id === 'SB 984';
          return (
            <div
              key={b.id}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: slot * (ROW + GAP),
                height: ROW,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0 14px',
                borderRadius: 12,
                border: `2px solid ${C.ink}`,
                background: C.ground,
                boxShadow: lifted ? '0 12px 24px rgba(0,0,0,0.18)' : 'none',
                transform: lifted ? 'scale(1.03)' : 'none',
                zIndex: lifted ? 2 : 1,
              }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: C.teal,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 15,
                }}>
                {Math.round(slot) + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.meta }}>
                  {b.id}
                  <span style={{ opacity: reveal }}>{` · ${b.vote}, won by ${b.margin}`}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: C.text2, marginBottom: 12 }}>3 points for an exact spot, 1 for one off</div>
        <div
          style={{
            height: 54,
            borderRadius: 27,
            background: C.ink,
            color: C.ground,
            fontWeight: 700,
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          Lock in ranking
        </div>
      </div>
    </div>
  );
}

export function Landslide() {
  return (
    <AbsoluteFill>
      <Background tint={C.teal} />
      <Copy
        label="03 · Landslide"
        color={C.teal}
        title="Which won biggest?"
        body="Rank four bills by how big they won. 3 points for an exact spot, 1 if you're one off."
      />
      <Phone>
        <LandslideScreen />
      </Phone>
      <Callout label="Widest margin" value="147–0" sub="SB 984, experimental treatments, in the Texas House" color={C.teal} at={160} />
    </AbsoluteFill>
  );
}

export function Friends() {
  const frame = useCurrentFrame();
  const list = 140;
  const open = 190;
  const votes = 250;
  // Priya's row on the Friends list, in screen points.
  const priya = { x: pt(0.27, SCREEN_W), y: pt(0.753, 870) };
  return (
    <AbsoluteFill>
      <Background tint={C.lavender} />
      <Copy
        label="Friends"
        color={C.lavender}
        title="Play with friends."
        body="A daily race on the leaderboard, scored across all three games."
        outAt={open - 12}
      />
      {frame >= open - 4 && (
        <Copy
          label="Friends"
          color={C.lavender}
          title="See where you agree."
          body="Open a friend: how often you vote the same, and both your votes side by side when you both share."
          delay={open}
        />
      )}
      <Phone>
        <Screens
          shots={[
            { src: 'leaderboard', at: 0 },
            { src: 'friends-list', at: list },
            { src: 'friend', at: open },
            { src: 'friend-votes', at: votes },
          ]}
        />
        <Tap x={priya.x} y={priya.y} at={open - 18} />
      </Phone>
      <Callout label="Today's leader" value="Priya · 25" sub="Points from all three games" color={C.lavender} at={30} outAt={list - 12} />
      <Callout label="Most in sync · Jordan" value="70%" sub="same vote, on the 10 bills you both played" color={C.teal} at={list + 14} outAt={open - 12} />
      <Callout label="You and Priya" value="50%" sub="same vote, on the 10 bills you both played" color={C.teal} at={open + 14} outAt={votes - 12} />
      <Callout label="Laken Riley Act" value="Nay · Yea" sub="You and Priya split on 5 of 10 bills" color={C.lavender} at={votes + 14} />
    </AbsoluteFill>
  );
}

export function Area() {
  return (
    <AbsoluteFill>
      <Background tint={C.teal} />
      <Copy
        label="Beyond your friends"
        color={C.teal}
        title="See your whole state."
        body="How your city, your state and everyone on Docket voted today. Scores appear once 10 people there have played."
      />
      <Phone>
        <Screens shots={[{ src: 'area', at: 0 }]} />
      </Phone>
      <Callout label="Texas today" value="7 players" sub="Scores stay hidden until 10 have played" color={C.teal} at={30} outAt={138} />
      <Callout label="Large loads on the grid" value="67% Yea" sub="6 Texas players voted, so the split shows" color={C.teal} at={164} />
    </AbsoluteFill>
  );
}

export function Profile() {
  return (
    <AbsoluteFill>
      <Background tint={C.lavender} />
      <Copy
        label="Profile"
        color={C.lavender}
        title="Your voter card."
        body="Your streak, your history in every game, and the lawmakers you actually agree with."
      />
      <Phone>
        <Screens
          shots={[
            { src: 'profile', at: 0 },
            { src: 'profile-lawmakers', at: 95 },
          ]}
        />
      </Phone>
      <Callout label="Your streak" value="4 days" sub="Best: 10 days" color={C.yellow} at={30} outAt={83} />
      <Callout label="You agree most with" value="100%" sub="Lloyd Doggett, U.S. House, Texas District 37" color={C.teal} at={109} />
    </AbsoluteFill>
  );
}

export function Records() {
  return (
    <AbsoluteFill>
      <Background tint={C.yellow} />
      <Copy
        label="Bills & lawmakers"
        color={C.yellow}
        title="Every bill. Every lawmaker."
        body="Tap a bill for the full record, including how your own lawmakers voted. Tap a lawmaker to see who they are."
      />
      <Phone>
        <Screens
          shots={[
            { src: 'bill', at: 0 },
            { src: 'lawmaker', at: 125 },
          ]}
        />
      </Phone>
      <Callout label="HB 1481 · Phones in classrooms" value="128–17" sub="Texas House. Your state rep voted Yea." color={C.yellow} at={30} outAt={113} />
      <Callout label="Gina Hinojosa · Texas House" value="67%" sub="You agree on 4 of the 6 bills you've both voted on" color={C.teal} at={139} />
    </AbsoluteFill>
  );
}

export function Nationwide() {
  const frame = useCurrentFrame();
  const count = Math.round(interpolate(frame, [40, 110], [0, 7967], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (t) => 1 - Math.pow(1 - t, 3) }));
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 170 }}>
        <Rise delay={2}>
          <div style={{ fontFamily: serif, fontWeight: 800, fontSize: 96, letterSpacing: -1.5 }}>Any U.S. ZIP code.</div>
        </Rise>
        <Rise delay={30} style={{ marginTop: 26, display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <span style={{ fontFamily: serif, fontWeight: 800, fontSize: 220, lineHeight: 1, letterSpacing: -6, fontVariantNumeric: 'tabular-nums' }}>
            {count.toLocaleString('en-US')}
          </span>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: 72 }}>lawmakers</span>
        </Rise>
        <Rise delay={70}>
          <div style={{ marginTop: 30, fontFamily: sans, fontSize: 36, color: C.text2 }}>
            Every member of Congress and every state legislator. Daily bills in all 50 states.
          </div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Rule({ n, text, delay }: { n: number; text: string; delay: number }) {
  return (
    <Rise delay={delay} style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 26 }}>
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          background: C.ink,
          color: C.ground,
          fontFamily: sans,
          fontWeight: 800,
          fontSize: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
        {n}
      </div>
      <div style={{ fontFamily: sans, fontSize: 32, lineHeight: 1.3, color: C.ink }}>{text}</div>
    </Rise>
  );
}

export function Privacy() {
  return (
    <AbsoluteFill>
      <Background tint={C.teal} />
      <div style={{ position: 'absolute', left: 130, top: 250, width: 600 }}>
        <Rise delay={4}>
          <div style={{ fontFamily: serif, fontWeight: 800, fontSize: 84, letterSpacing: -1.5, lineHeight: 1.02 }}>Private by design.</div>
        </Rise>
        <Rule n={1} text="Party stays hidden until you've voted." delay={22} />
        <Rule n={2} text="Vote splits stay hidden until 5 people vote, or 10 if everyone agreed." delay={40} />
        <Rule n={3} text="Your votes are shared only if you both opt in." delay={58} />
      </div>
      <Phone>
        <Screens shots={[{ src: 'group', at: 0 }]} />
      </Phone>
      <Callout label="Group splits" value="5+ voters" sub="10 if everyone voted the same way" color={C.teal} at={70} />
    </AbsoluteFill>
  );
}

export function Close() {
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 250, gap: 30 }}>
        <Wordmark size={220} delay={4} />
        <Tiles delay={16} size={38} gap={16} />
        <Rise delay={26}>
          <div style={{ fontFamily: serif, fontWeight: 700, fontSize: 58, letterSpacing: -0.5 }}>{"Play today's ballot."}</div>
        </Rise>
        <Rise delay={40}>
          <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 32, color: C.meta }}>docketapp.tech</div>
        </Rise>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

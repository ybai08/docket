import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { FiledOrFakeGlyph, LandslideGlyph, RollCallGlyph } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { colors, fonts, type } from '@/theme';

type Guide = { title: string; color: string; glyph: ReactNode; intro: string; steps: [string, string][]; scoring: string };

const GUIDES: Record<string, Guide> = {
  'roll-call': {
    title: 'Roll Call',
    color: colors.lavender,
    glyph: <RollCallGlyph size={40} />,
    intro: 'Five real bills that lawmakers voted on. How would you have voted?',
    steps: [
      ['Read the bill', 'Each card says what the bill does, where it came from, and its number.'],
      ['Cast your vote', 'Tap Yea or Nay, or swipe the card right for Yea and left for Nay.'],
      ['See how it went', 'Find out whether you agreed with the final vote, and how each chamber voted.'],
    ],
    scoring: 'Finish all five bills for 5 points on the leaderboard.',
  },
  'filed-or-fake': {
    title: 'Filed or Fake',
    color: colors.yellow,
    glyph: <FiledOrFakeGlyph size={40} />,
    intro: 'Eight bills. Some were really filed by lawmakers, and Docket made the rest up.',
    steps: [
      ['Read what it would do', 'Each bill is a short, plain description of what it would change.'],
      ['Call it', 'Tap Filed if you think a lawmaker really filed it, or Fake if you think Docket wrote it.'],
      ['See the stamp', 'Every answer is stamped FILED or FAKE. Open a real one to see what happened to it.'],
    ],
    scoring: '1 point for each bill you get right, up to 8.',
  },
  landslide: {
    title: 'Landslide',
    color: colors.teal,
    glyph: <LandslideGlyph size={40} />,
    intro: 'Four bills that passed. Which one won by the widest margin?',
    steps: [
      ['Rank them', 'Press and hold a bill, then drag it. Put the widest win on top and the closest vote at the bottom.'],
      ['Lock it in', 'When the order looks right, tap Lock in ranking.'],
      ['See the real order', 'Each bill shows its final vote and how much it won by.'],
    ],
    scoring: '3 points for each bill in exactly the right spot, 1 point if it is one spot off. Up to 12.',
  },
};

/** How to play one game, as a sheet over the game. */
export default function HowToPlay() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const g = GUIDES[game] ?? GUIDES['roll-call'];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.ground }} contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: g.color, alignItems: 'center', justifyContent: 'center' }}>
          {g.glyph}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>How to play</Text>
          <Text style={type.game} accessibilityRole="header">
            {g.title}
          </Text>
        </View>
      </View>

      <Text style={type.bodyLg}>{g.intro}</Text>

      <View style={{ gap: 18 }}>
        {g.steps.map(([head, body], i) => (
          <View key={head} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.ground, fontSize: 15, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, fontWeight: '700' }}>{head}</Text>
              <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>{body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ gap: 4, padding: 16, borderRadius: 14, backgroundColor: colors.muted }}>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 18 }}>Scoring</Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text2 }}>{g.scoring}</Text>
      </View>

      <PillButton label="Got it" style={{ alignSelf: 'stretch', height: 50 }} onPress={() => router.back()} />
    </ScrollView>
  );
}

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PillButton } from '@/components/pill-button';
import { ProgressTiles, type TileState } from '@/components/progress-tiles';
import { ScreenHeader } from '@/components/screen-header';
import { Stamp } from '@/components/stamp';
import type { Caption } from '@/data/types';
import { filedOrFakeScore } from '@/lib/scoring';
import { shareText } from '@/lib/share';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

function showHelp() {
  Alert.alert(
    'How to play Filed or Fake',
    'Read each bill caption. Decide whether a lawmaker really filed it or Docket made it up. Every made-up one is marked FAKE after you answer.',
  );
}

export default function FiledOrFakeScreen() {
  const { day, set, progress, status, update } = useToday();
  const captions = set.filedOrFake;
  const answers = progress.filedOrFake.answers;
  // The caption just answered stays on screen with its stamp until "Next caption".
  const [showing, setShowing] = useState<string | null>(null);

  const nextIndex = captions.findIndex((c) => answers[c.id] === undefined);
  const allAnswered = nextIndex === -1;
  const finished = progress.filedOrFake.done || (allAnswered && !showing);

  useEffect(() => {
    if (!allAnswered || showing || progress.filedOrFake.done) return;
    update(day, (p) => ({
      ...p,
      filedOrFake: { ...p.filedOrFake, done: true, score: filedOrFakeScore(captions, p.filedOrFake.answers) },
    }));
  }, [allAnswered, showing, progress.filedOrFake.done, captions, day, update]);

  if (finished) {
    return (
      <Results
        captions={captions}
        answers={answers}
        onShare={() => Share.share({ message: shareText(day, set, progress, status) })}
      />
    );
  }

  const caption = showing ? captions.find((c) => c.id === showing)! : captions[nextIndex];
  const index = captions.indexOf(caption);
  const guess = answers[caption.id];
  const answered = guess !== undefined;
  const right = answered && guess === caption.real;

  const tiles: TileState[] = captions.map((c, i) => (i === index ? 'current' : answers[c.id] !== undefined ? 'done' : 'todo'));

  function answer(filed: boolean) {
    if (answered) return;
    Haptics.notificationAsync(
      filed === caption.real ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
    setShowing(caption.id);
    update(day, (p) => ({ ...p, filedOrFake: { ...p.filedOrFake, answers: { ...p.filedOrFake.answers, [caption.id]: filed } } }));
  }

  const last = captions.every((c) => c.id === caption.id || answers[c.id] !== undefined);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title="Filed or Fake" onHelp={showHelp} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={[type.meta, { fontSize: 14 }]}>
            Caption {index + 1} of {captions.length}
          </Text>
          <ProgressTiles size="lg" accent={colors.yellow} states={tiles} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          <View
            style={{
              paddingTop: 26,
              paddingHorizontal: 22,
              paddingBottom: 70,
              borderRadius: 14,
              borderWidth: 2,
              backgroundColor: colors.cream,
              gap: 14,
            }}>
            <Text style={{ fontSize: 13, fontWeight: '700' }}>{caption.origin}</Text>
            <Text style={{ fontFamily: fonts.serif500Italic, fontSize: 26, lineHeight: 33 }}>“{caption.text}”</Text>
            {answered && (
              <Stamp
                key={caption.id}
                label={caption.real ? 'FILED' : 'FAKE'}
                color={caption.real ? colors.ink : colors.fakeInk}
                fontSize={26}
                rotate={-9}
                style={{ position: 'absolute', right: 20, bottom: 18 }}
              />
            )}
          </View>

          {answered && (
            <View style={{ gap: 4, alignItems: 'center' }} accessibilityLiveRegion="polite">
              <Text style={{ fontFamily: fonts.serif700, fontSize: 24 }}>{right ? 'Good eye.' : 'Not quite.'}</Text>
              <Text style={[type.body, { lineHeight: 21, color: colors.text2, textAlign: 'center' }]}>
                {caption.explanation}
              </Text>
              {caption.real && caption.sourceUrl && (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(caption.sourceUrl!)} hitSlop={8}>
                  <Text style={{ fontSize: 15, fontWeight: '600', textDecorationLine: 'underline', marginTop: 4 }}>
                    See {caption.number} on Texas Legislature Online
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <AnswerButton label="Fake" picked={guess === false} locked={answered} onPress={() => answer(false)} />
            <AnswerButton label="Filed" picked={guess === true} locked={answered} onPress={() => answer(true)} />
          </View>
          {answered && (
            <PillButton label={last ? 'See results' : 'Next caption'} onPress={() => setShowing(null)} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function AnswerButton({ label, picked, locked, onPress }: { label: string; picked: boolean; locked: boolean; onPress: () => void }) {
  const dim = locked && !picked;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked, selected: picked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 50,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: dim ? colors.outline : colors.ink,
        backgroundColor: picked ? colors.yellow : colors.ground,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 17, fontWeight: dim ? '600' : '700', color: dim ? colors.tabInactive : colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function Results({
  captions,
  answers,
  onShare,
}: {
  captions: Caption[];
  answers: Record<string, boolean>;
  onShare: () => void;
}) {
  const score = filedOrFakeScore(captions, answers);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Filed or Fake" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={[type.billTitle, { textAlign: 'center' }]} accessibilityRole="header">
            You spotted {score} of {captions.length}
          </Text>
          <Text style={[type.body, { color: colors.text2, textAlign: 'center' }]}>
            {captions.filter((c) => !c.real).length} were made up by Docket. The rest were really filed in 2025.
          </Text>
        </View>

        <View>
          {captions.map((c) => {
            const right = answers[c.id] === c.real;
            return (
              <View key={c.id} style={{ gap: 6, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 1,
                      borderRadius: 6,
                      borderWidth: 2,
                      borderColor: c.real ? colors.ink : colors.fakeInk,
                    }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.5, color: c.real ? colors.ink : colors.fakeInk }}>
                      {c.real ? `FILED · ${c.number}` : 'FAKE'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: right ? colors.ink : colors.meta }}>
                    {right ? 'You got it' : `You said ${answers[c.id] ? 'Filed' : 'Fake'}`}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.serif500Italic, fontSize: 17, lineHeight: 22 }}>“{c.text}”</Text>
              </View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PillButton label="Today" variant="outline" style={{ flex: 1 }} onPress={() => router.dismissTo('/')} />
          <PillButton label="Share" style={{ flex: 1 }} onPress={onShare} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

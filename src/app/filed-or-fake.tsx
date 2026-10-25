import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { CheckIcon, ChevronRight } from '@/components/icons';
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
  router.push({ pathname: '/how-to-play/[game]', params: { game: 'filed-or-fake' } });
}

export default function FiledOrFakeScreen() {
  const { day, set, progress, status, actions } = useToday();
  const captions = set.filedOrFake;
  const answers = progress.filedOrFake.answers;
  // The caption just answered stays on screen with its stamp until "Next caption".
  const [showing, setShowing] = useState<string | null>(null);

  const nextIndex = captions.findIndex((c) => answers[c.id] === undefined);
  const allAnswered = nextIndex === -1;
  const finished = progress.filedOrFake.done || (allAnswered && !showing);

  const doneOnServer = progress.filedOrFake.done;
  const { finishFiledOrFake } = actions;
  useEffect(() => {
    if (allAnswered && !showing && !doneOnServer) finishFiledOrFake();
  }, [allAnswered, showing, doneOnServer, finishFiledOrFake]);

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
    actions.answerCaption(caption.id, filed);
  }

  const last = captions.every((c) => c.id === caption.id || answers[c.id] !== undefined);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title="Filed or Fake" onHelp={showHelp} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={[type.meta, { fontSize: 14 }]}>
            Bill {index + 1} of {captions.length}
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
            <Text style={{ fontFamily: fonts.serif700, fontSize: 26, lineHeight: 32 }}>{caption.text}</Text>
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
              {caption.real && (
                <PillButton
                  size="md"
                  label={`See ${caption.number ?? 'the bill'}`}
                  style={{ marginTop: 6 }}
                  onPress={() => router.push({ pathname: '/bill/[id]', params: { id: caption.id } })}
                />
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
            <PillButton label={last ? 'See results' : 'Next bill'} onPress={() => setShowing(null)} />
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
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 22, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.cream }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>You spotted</Text>
          <Text style={{ fontFamily: fonts.serif800, fontSize: 48, lineHeight: 52 }} accessibilityRole="header">
            {score} of {captions.length}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }} accessible={false} importantForAccessibility="no-hide-descendants">
            {captions.map((c) => (
              <View
                key={c.id}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  borderWidth: 1.5,
                  backgroundColor: answers[c.id] === c.real ? colors.teal : colors.lavender,
                }}
              />
            ))}
          </View>
          <Text style={[type.body, { color: colors.text2, textAlign: 'center', lineHeight: 21 }]}>
            {captions.filter((c) => !c.real).length} were made up by Docket. The rest were really filed by lawmakers.
          </Text>
        </View>

        <View>
          {captions.map((c, i) => {
            const right = answers[c.id] === c.real;
            const said = answers[c.id] ? 'Filed' : 'Fake';
            return (
              <Pressable
                key={c.id}
                accessibilityLabel={`${c.text}. ${c.real ? `Filed, ${c.number}` : 'Fake'}. You said ${said}, ${right ? 'right' : 'wrong'}.`}
                accessibilityHint={c.real ? 'Opens the bill' : undefined}
                disabled={!c.real}
                onPress={() => router.push({ pathname: '/bill/[id]', params: { id: c.id } })}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  gap: 14,
                  paddingVertical: 16,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.hairline,
                  opacity: pressed ? 0.6 : 1,
                })}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    marginTop: 1,
                    backgroundColor: right ? colors.teal : colors.lavender,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {right ? <CheckIcon size={15} /> : <CrossIcon />}
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ fontSize: 16, lineHeight: 22, fontWeight: '600' }}>{c.text}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 5,
                        borderWidth: 1.5,
                        borderColor: c.real ? colors.ink : colors.fakeInk,
                      }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: c.real ? colors.ink : colors.fakeInk }}>
                        {c.real ? `FILED · ${c.number}` : 'FAKE'}
                      </Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, color: colors.meta }}>
                      You said {said}
                    </Text>
                    {c.real && <ChevronRight size={14} color={colors.meta} />}
                  </View>
                </View>
              </Pressable>
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

function CrossIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={3.2} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

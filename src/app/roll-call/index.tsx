import * as Haptics from 'expo-haptics';
import { Redirect, router } from 'expo-router';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { BillCard } from '@/components/bill-card';
import { PillButton } from '@/components/pill-button';
import { ProgressTiles, tilesFor } from '@/components/progress-tiles';
import { ScreenHeader } from '@/components/screen-header';
import type { Bill, Vote } from '@/data/types';
import { useToday } from '@/lib/use-today';
import { colors, type } from '@/theme';

const CARD_HEIGHT = 300;
const SWIPE_COMMIT = 110;

export function showRollCallHelp() {
  router.push({ pathname: '/how-to-play/[game]', params: { game: 'roll-call' } });
}

export default function RollCallScreen() {
  const { set, progress, actions } = useToday();
  const deck = useRef<DeckHandle>(null);
  const votes = progress.rollCall.votes;
  const index = set.rollCall.findIndex((b) => !votes[b.id]);
  const done = index === -1;
  const bill = done ? null : set.rollCall[index];
  const next = done ? null : (set.rollCall[index + 1] ?? null);

  if (progress.rollCall.revealed) return <Redirect href="/roll-call/results" />;

  function cast(b: Bill, vote: Vote) {
    actions.vote(b.id, vote);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title="Roll Call" onHelp={showRollCallHelp} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text style={[type.meta, { fontSize: 14 }]} accessibilityLiveRegion="polite">
            {done ? `All ${set.rollCall.length} voted` : `Bill ${index + 1} of ${set.rollCall.length}`}
          </Text>
          <ProgressTiles size="lg" states={tilesFor(set.rollCall.length, done ? set.rollCall.length : index, true)} />
        </View>

        {bill ? (
          <>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ height: CARD_HEIGHT + 30 }}>
                {index < set.rollCall.length - 2 && <BackPlate inset={14} top={20} />}
                {index < set.rollCall.length - 1 && <BackPlate inset={7} top={10} />}
                {/* The next bill sits right under the top card, so its text shows as the top card leaves. */}
                {next && <NextCard key={next.id} bill={next} />}
                <SwipeCard key={bill.id} ref={deck} bill={bill} onVote={(v) => cast(bill, v)} />
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <PillButton label="Nay" variant="outline" style={{ flex: 1 }} onPress={() => deck.current?.vote('nay')} />
                <PillButton label="Yea" style={{ flex: 1, borderWidth: 2 }} onPress={() => deck.current?.vote('yea')} />
              </View>
              <Text style={[type.meta, { textAlign: 'center' }]}>Or swipe the card right for Yea, left for Nay</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, paddingHorizontal: 20 }}>
              <Text style={[type.title, { textAlign: 'center' }]} accessibilityRole="header">
                Your votes are in
              </Text>
              <Text style={[type.bodyLg, { textAlign: 'center' }]}>
                See what happened to each bill and how your friends and lawmakers voted.
              </Text>
            </View>
            <View style={{ gap: 10, alignItems: 'center' }}>
              <PillButton label="See results" style={{ alignSelf: 'stretch' }} onPress={() => router.replace('/roll-call/results')} />
              <Pressable
                accessibilityRole="button"
                onPress={actions.resetVotes}
                style={{ height: 44, paddingHorizontal: 16, justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' }}>Vote again</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function BackPlate({ inset, top }: { inset: number; top: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: inset,
        right: inset,
        top,
        height: CARD_HEIGHT,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: colors.ink,
        backgroundColor: colors.ground,
      }}
    />
  );
}

type DeckHandle = { vote: (v: Vote) => void };

function SwipeCard({ bill, onVote, ref }: { bill: Bill; onVote: (v: Vote) => void; ref: Ref<DeckHandle> }) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const committed = useRef(false);

  function commit(vote: Vote) {
    if (committed.current) return;
    committed.current = true;
    onVote(vote);
  }

  function flyOut(vote: Vote) {
    if (committed.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reduceMotion) return commit(vote);
    x.set(withTiming((vote === 'yea' ? 1 : -1) * width * 1.2, { duration: 220 }, (finished) => {
      if (finished) scheduleOnRN(commit, vote);
    }));
  }

  useImperativeHandle(ref, () => ({ vote: flyOut }));

  const pan = usePanGesture({
    activeOffsetX: [-10, 10],
    onActivate: () => {
      start.set(x.get());
    },
    onUpdate: (e) => {
      x.set(start.get() + e.translationX);
    },
    onDeactivate: (e) => {
      const projected = x.get() + e.velocityX * 0.15;
      if (Math.abs(projected) > SWIPE_COMMIT) {
        scheduleOnRN(flyOut, projected > 0 ? 'yea' : 'nay');
      } else {
        x.set(withSpring(0, { duration: 300, dampingRatio: 1, velocity: e.velocityX }));
      }
    },
  });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { rotate: `${x.get() / 22}deg` }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: CARD_HEIGHT }, style]}
        accessible
        accessibilityLabel={`${bill.number}, ${bill.origin}. ${bill.title}. ${bill.summary}`}
        accessibilityActions={[
          { name: 'yea', label: 'Vote Yea' },
          { name: 'nay', label: 'Vote Nay' },
        ]}
        onAccessibilityAction={(e) => flyOut(e.nativeEvent.actionName === 'yea' ? 'yea' : 'nay')}>
        <BillFace bill={bill} />
      </Animated.View>
    </GestureDetector>
  );
}

/** Same position as the top card, hidden from VoiceOver and touches until it's on top. */
function NextCard({ bill }: { bill: Bill }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, height: CARD_HEIGHT }}>
      <BillFace bill={bill} />
    </View>
  );
}

function BillFace({ bill }: { bill: Bill }) {
  return (
    <BillCard number={bill.number} level={bill.level} chamber={bill.origin} title={bill.title} summary={bill.summary} style={{ flex: 1 }}>
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(bill.sourceUrl)} hitSlop={8}>
        <Text style={{ fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' }}>Read the bill</Text>
      </Pressable>
    </BillCard>
  );
}

import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import type { LandslideItem } from '@/data/types';
import { landslideAnswer, landslidePoints, margin } from '@/lib/scoring';
import { shareText } from '@/lib/share';
import { useToday } from '@/lib/use-today';
import { colors, type } from '@/theme';

const ROW = 72; // row height
const GAP = 8;
const SLOT = ROW + GAP;
const SETTLE = { duration: 250, dampingRatio: 1 };

function showHelp() {
  Alert.alert(
    'How to play Landslide',
    'Long-press a bill and drag it to rank all four by the final Texas House vote, widest margin on top. 3 points for an exact spot, 1 for one off.',
  );
}

export default function LandslideScreen() {
  const { day, set, progress, status, actions } = useToday();
  const items = set.landslide.items;

  if (progress.landslide.done && progress.landslide.order) {
    return (
      <Reveal
        items={items}
        order={progress.landslide.order}
        onShare={() => Share.share({ message: shareText(day, set, progress, status) })}
      />
    );
  }

  return (
    <Ranking
      items={items}
      prompt={set.landslide.prompt}
      onLock={(order) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        actions.lockLandslide(order);
      }}
    />
  );
}

function Ranking({ items, prompt, onLock }: { items: LandslideItem[]; prompt: string; onLock: (order: string[]) => void }) {
  // positions[billId] = slot index. Lives on the UI thread so rows can swap mid-drag.
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(items.map((it, i) => [it.billId, i])));
  const [order, setOrder] = useState(() => items.map((it) => it.billId));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top', 'bottom']}>
      <ScreenHeader title="Landslide" onHelp={showHelp} />
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 12, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingTop: 4 }}>
          <Text style={[type.billTitle, { textAlign: 'center' }]} accessibilityRole="header">
            Which bill won biggest?
          </Text>
          <Text style={[type.body, { lineHeight: 21, color: colors.text2, textAlign: 'center' }]}>{prompt}</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.2 }}>Widest margin</Text>
          <View style={{ height: items.length * SLOT - GAP }}>
            {items.map((it) => (
              <DraggableRow
                key={it.billId}
                item={it}
                count={items.length}
                positions={positions}
                onDrop={setOrder}
                onMove={(id, to) => {
                  const next = order.filter((x) => x !== id);
                  next.splice(to, 0, id);
                  setOrder(next);
                  positions.set(Object.fromEntries(next.map((x, i) => [x, i])));
                }}
              />
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.2 }}>Closest vote</Text>
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ gap: 10 }}>
          <Text style={[type.meta, { textAlign: 'center' }]}>3 points for an exact spot, 1 for one off</Text>
          <PillButton label="Lock in ranking" onPress={() => onLock(order)} />
        </View>
      </View>
    </SafeAreaView>
  );
}

function DraggableRow({
  item,
  count,
  positions,
  onDrop,
  onMove,
}: {
  item: LandslideItem;
  count: number;
  positions: SharedValue<Record<string, number>>;
  onDrop: (order: string[]) => void;
  /** Accessibility: move this row to a slot. */
  onMove: (id: string, to: number) => void;
}) {
  const id = item.billId;
  const reduceMotion = useReducedMotion();
  const top = useSharedValue(positions.get()[id] * SLOT);
  const lifted = useSharedValue(false);
  const start = useSharedValue(0);
  const [rank, setRank] = useState(positions.get()[id] + 1);
  const [isLifted, setIsLifted] = useState(false);

  // Follow slot changes caused by other rows (or by accessibility moves).
  useAnimatedReaction(
    () => positions.get()[id],
    (slot, prev) => {
      if (slot === prev) return;
      scheduleOnRN(setRank, slot + 1);
      if (!lifted.get()) top.set(reduceMotion ? slot * SLOT : withSpring(slot * SLOT, SETTLE));
    },
  );

  function pickUp() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLifted(true);
  }

  function drop(next: Record<string, number>) {
    setIsLifted(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDrop(Object.keys(next).sort((a, b) => next[a] - next[b]));
  }

  const pan = usePanGesture({
    activateAfterLongPress: 220,
    onActivate: () => {
      lifted.set(true);
      start.set(top.get());
      scheduleOnRN(pickUp);
    },
    onUpdate: (e) => {
      const y = Math.max(-GAP, Math.min(start.get() + e.translationY, (count - 1) * SLOT + GAP));
      top.set(y);
      const to = Math.max(0, Math.min(count - 1, Math.round(y / SLOT)));
      const current = positions.get();
      const from = current[id];
      if (to === from) return;
      // Swap with whoever holds the target slot; neighbours shift by one.
      const next: Record<string, number> = {};
      for (const key of Object.keys(current)) {
        const p = current[key];
        if (key === id) next[key] = to;
        else if (from < to && p > from && p <= to) next[key] = p - 1;
        else if (from > to && p < from && p >= to) next[key] = p + 1;
        else next[key] = p;
      }
      positions.set(next);
      scheduleOnRN(Haptics.selectionAsync);
    },
    onDeactivate: () => {
      lifted.set(false);
      const slot = positions.get()[id];
      top.set(withSpring(slot * SLOT, SETTLE));
      scheduleOnRN(drop, positions.get());
    },
  });

  const style = useAnimatedStyle(() => {
    const up = lifted.get();
    return {
      top: top.get(),
      zIndex: up ? 10 : 1,
      transform: [{ translateX: up ? -3 : 0 }, { translateY: up ? -3 : 0 }],
      boxShadow: up ? '4px 4px 0px #000000' : '0px 0px 0px transparent',
    };
  });

  const slot = rank - 1;
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessible
        accessibilityLabel={`${item.number}, ${item.title}. Ranked ${rank} of ${count}.`}
        accessibilityHint="Long-press and drag to reorder."
        accessibilityActions={[
          { name: 'up', label: 'Move up' },
          { name: 'down', label: 'Move down' },
        ]}
        onAccessibilityAction={(e) => {
          const to = e.nativeEvent.actionName === 'up' ? slot - 1 : slot + 1;
          if (to >= 0 && to < count) onMove(id, to);
        }}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            height: ROW,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 2,
            backgroundColor: isLifted ? colors.teal : colors.ground,
          },
          style,
        ]}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            backgroundColor: isLifted ? colors.ink : colors.teal,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'], color: isLifted ? colors.ground : colors.ink }}>
            {rank}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: isLifted ? '#1F3B38' : colors.meta, fontVariant: ['tabular-nums'] }}>
            {item.number}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function Reveal({ items, order, onShare }: { items: LandslideItem[]; order: string[]; onShare: () => void }) {
  const answer = landslideAnswer(items);
  const points = landslidePoints(order, answer);
  const score = points.reduce((a, b) => a + b, 0);
  const byId = Object.fromEntries(items.map((it) => [it.billId, it]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title="Landslide" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 20 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={[type.billTitle, { textAlign: 'center' }]} accessibilityRole="header">
            {score} of {items.length * 3} points
          </Text>
          <Text style={[type.body, { color: colors.text2, textAlign: 'center' }]}>
            The real order, by the final Texas House vote.
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.2 }}>Widest margin</Text>
          {answer.map((id, i) => {
            const it = byId[id];
            const yourSlot = order.indexOf(id);
            const pts = points[yourSlot];
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={`${i + 1}. ${it.number}, ${it.title}. Passed ${it.yeas} to ${it.nays}. You ranked it ${yourSlot + 1}, ${pts} points.`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 2 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: colors.teal,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta, fontVariant: ['tabular-nums'] }}>
                    {it.number} · {it.yeas}–{it.nays}, won by {margin(it)}
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '600' }}>{it.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.text2 }}>You put it #{yourSlot + 1}</Text>
                </View>
                <View
                  style={{
                    minWidth: 40,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    borderWidth: 1.5,
                    borderColor: pts ? colors.ink : colors.outline,
                    backgroundColor: pts === 3 ? colors.teal : colors.ground,
                    alignItems: 'center',
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'], color: pts ? colors.ink : colors.meta }}>
                    +{pts}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.2 }}>Closest vote</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <PillButton label="Today" variant="outline" style={{ flex: 1 }} onPress={() => router.dismissTo('/')} />
          <PillButton label="Share" style={{ flex: 1 }} onPress={onShare} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

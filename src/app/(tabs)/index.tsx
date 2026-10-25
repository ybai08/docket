import { router, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { BallotStubCard } from '@/components/ballot-stub-card';
import { CheckIcon, ChevronRight, FiledOrFakeGlyph, FlameIcon, LandslideGlyph, RollCallGlyph } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ProgressTiles, tilesFor } from '@/components/progress-tiles';
import { TabScreen } from '@/components/tab-screen';
import { formatDayLong } from '@/lib/day';
import { useToday, type GameStatus } from '@/lib/use-today';
import { colors, type } from '@/theme';

export default function TodayScreen() {
  const { day, status, cast, stats, loadState, error, reload } = useToday();
  const streak = stats.currentStreak;

  return (
    <TabScreen>
      <View style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.ink }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={type.brand}>Docket</Text>
          <View
            accessible
            accessibilityLabel={`${streak}-day streak`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
            }}>
            <FlameIcon />
            <Text style={{ fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{streak}</Text>
          </View>
        </View>
        <Text style={type.display} accessibilityRole="header">
          {"Today's ballots"}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors.text2 }}>{formatDayLong(day)}</Text>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            accessible
            accessibilityLabel={`${cast} of 3 ballots cast`}>
            <ProgressTiles size="sm" states={tilesFor(3, cast)} />
            <Text style={{ fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{cast} of 3 cast</Text>
          </View>
        </View>
      </View>

      {loadState === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.ink} />
          <Text style={type.meta}>{"Loading today's ballots"}</Text>
        </View>
      )}
      {error && loadState !== 'loading' && <SyncError message={error} onRetry={reload} />}

      <View style={{ gap: 10 }}>
        <BallotStubCard
          color={colors.lavender}
          title="Roll Call"
          subtitle="Congress, Texas and Austin. See who agreed."
          glyph={<RollCallGlyph />}
          status={
            <Status s={status.rollCall} unit="votes" result={`Agreed on ${status.rollCall.result} of ${status.rollCall.total}`} />
          }
          action={<Action s={status.rollCall} play="/roll-call" results="/roll-call/results" />}
        />
        <BallotStubCard
          color={colors.yellow}
          title="Filed or Fake"
          subtitle="Eight bill captions. Some were made up."
          glyph={<FiledOrFakeGlyph />}
          status={
            <Status
              s={status.filedOrFake}
              unit="captions"
              result={`Cast, ${status.filedOrFake.result} of ${status.filedOrFake.total} right`}
            />
          }
          action={<Action s={status.filedOrFake} play="/filed-or-fake" results="/filed-or-fake" />}
        />
        <BallotStubCard
          color={colors.teal}
          title="Landslide"
          subtitle="Rank four bills by how big they won."
          glyph={<LandslideGlyph />}
          status={<Status s={status.landslide} unit="" result={`Cast, ${status.landslide.result ?? 0} points`} />}
          action={<Action s={status.landslide} play="/landslide" results="/landslide" />}
        />
      </View>

      <LeaderboardTeaser />
    </TabScreen>
  );
}

function SyncError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: colors.muted,
      }}>
      <Text style={[type.meta, { flex: 1, color: colors.text2 }]}>
        {message} Your ballots are saved on this phone until it syncs.
      </Text>
      <PillButton size="md" variant="outline" label="Retry" onPress={onRetry} />
    </View>
  );
}

function Status({ s, unit, result }: { s: GameStatus; unit: string; result: string }) {
  if (s.state === 'done') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CheckIcon />
        <Text style={{ fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{result}</Text>
      </View>
    );
  }
  if (s.state === 'progress') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {s.total <= 5 && <ProgressTiles states={tilesFor(s.total, s.done)} />}
        <Text style={{ marginLeft: s.total <= 5 ? 6 : 0, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
          {s.done} of {s.total} {unit}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.ground }}>
      <Text style={{ fontSize: 12, fontWeight: '800' }}>New today</Text>
    </View>
  );
}

function Action({ s, play, results }: { s: GameStatus; play: Href; results: Href }) {
  if (s.state === 'done') {
    return <PillButton size="md" variant="outline" label="See results" onPress={() => router.push(results)} />;
  }
  return (
    <PillButton
      size="md"
      label={s.state === 'progress' ? 'Continue' : 'Play'}
      style={s.state === 'new' ? { paddingHorizontal: 26 } : undefined}
      onPress={() => router.push(play)}
    />
  );
}

// Sample data until friends ship in Slice 6.
function LeaderboardTeaser() {
  const avatars = [
    { letter: 'P', color: colors.lavender },
    { letter: 'S', color: colors.yellow },
    { letter: 'J', color: colors.teal },
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens the Friends leaderboard"
      onPress={() => router.push('/friends')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: colors.ink,
        opacity: pressed ? 0.7 : 1,
      })}>
      <View style={{ flexDirection: 'row' }}>
        {avatars.map((a, i) => (
          <View
            key={a.letter}
            style={{
              width: 30,
              height: 30,
              marginLeft: i ? -9 : 0,
              borderRadius: 15,
              borderWidth: 2,
              borderColor: colors.ground,
              backgroundColor: a.color,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ fontSize: 12, fontWeight: '700' }}>{a.letter}</Text>
          </View>
        ))}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '700' }}>Priya leads today with 24</Text>
        <Text style={{ fontSize: 13, color: colors.text2 }}>{"You're 2nd, 3 points behind"}</Text>
      </View>
      <ChevronRight />
    </Pressable>
  );
}

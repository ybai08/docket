import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { PillButton } from '@/components/pill-button';
import { TabScreen } from '@/components/tab-screen';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { addDays } from '@/lib/day';
import { useMe } from '@/lib/me-context';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

type Level = 'state' | 'federal' | 'local';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, stats: serverStats } = useMe();
  const { day, stats } = useToday();
  const [level, setLevel] = useState<Level>('state');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // Apple's "Hide My Email" gives a random relay address; don't show it as a name.
  const hiddenEmail = user.email?.endsWith('@privaterelay.appleid.com') ?? false;
  const name = profile?.displayName || user.displayName || (!hiddenEmail && user.email?.split('@')[0]) || 'Docket member';
  const where = [
    profile?.city,
    profile?.districts?.stateHouse ? `${profileStateName(profile.state)} House District ${profile.districts.stateHouse}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const since = new Date(profile?.createdAt ?? user.metadata.creationTime ?? `${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  function confirmSignOut() {
    Alert.alert('Sign out of Docket?', 'You can sign back in anytime with Apple or Google.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut().catch((err) => setError(authErrorMessage(err))),
      },
    ]);
  }

  const byGame = serverStats?.byGame;

  return (
    <TabScreen gap={26}>
      <View style={{ paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.ink }}>
        <Text style={type.title} accessibilityRole="header">
          Profile
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: 34,
            backgroundColor: colors.lavender,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 30 }}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 26, lineHeight: 30 }}>{name}</Text>
          {where ? <Text style={{ fontSize: 14, color: colors.text2 }}>{where}</Text> : null}
          <Text style={type.meta}>Playing since {since}</Text>
        </View>
      </View>

      <View style={{ gap: 14 }}>
        <Text style={type.section} accessibilityRole="header">
          Statistics
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Stat value={serverStats?.daysPlayed ?? stats.rollCallsPlayed} label="Days played" />
          <Stat value={serverStats?.billsVoted ?? 0} label="Bills voted" />
          <Stat value={stats.currentStreak} label="Current streak" />
          <Stat value={stats.maxStreak} label="Max streak" />
        </View>
        <WeekStrip today={day} played={new Set(serverStats?.weekPlayed ?? [])} />
      </View>

      <View style={{ gap: 10 }}>
        <Text style={type.section} accessibilityRole="header">
          By game
        </Text>
        <GameRow color={colors.lavender} game="Roll Call">
          Agreed with the final vote <B>{byGame?.rollCallAgreementPct != null ? `${byGame.rollCallAgreementPct}%` : '–'}</B>
        </GameRow>
        <GameRow color={colors.yellow} game="Filed or Fake">
          Spotted <B>{byGame?.filedOrFakePct != null ? `${byGame.filedOrFakePct}%` : '–'}</B> correctly
        </GameRow>
        <GameRow color={colors.teal} game="Landslide">
          Average <B>{byGame?.landslideAvg != null ? `${byGame.landslideAvg} of 12` : '–'}</B> points
        </GameRow>
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 24 }} accessibilityRole="header">
            Issues you care about
          </Text>
          <Text style={{ fontSize: 14, color: colors.meta }}>From your Roll Call votes, most-voted topics first</Text>
        </View>
        {serverStats?.issues.length ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700' }}>Mostly Nay</Text>
              <Text style={{ fontSize: 12, fontWeight: '700' }}>Mostly Yea</Text>
            </View>
            {serverStats.issues.slice(0, 5).map((i) => (
              <IssueRow key={i.topic} name={i.topic} yeaPct={i.yeaPct} votes={i.votes} />
            ))}
          </>
        ) : (
          <Text style={type.meta}>Play a Roll Call to see where you lean on each topic.</Text>
        )}
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontFamily: fonts.serif700, fontSize: 24 }} accessibilityRole="header">
            Lawmakers you agree with
          </Text>
          <Text style={{ fontSize: 14, color: colors.meta }}>Compared on the bills you both voted on</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
          {(
            [
              ['state', profileStateName(profile?.state) || 'State'],
              ['federal', 'Congress'],
              ['local', 'Local'],
            ] as [Level, string][]
          ).map(([id, label]) => {
            const on = level === id;
            return (
              <PillTab key={id} label={label} on={on} onPress={() => setLevel(id)} />
            );
          })}
        </View>
        <View>
          {lawmakers(level, profile).map((p, i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: 1, borderTopColor: colors.hairline }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.hairline }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{p.name}</Text>
                <Text style={type.meta}>{p.role}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 1 }}>
                <Text style={{ fontSize: 20, fontVariant: ['tabular-nums'] }}>[%]</Text>
                <Text style={{ fontSize: 12, color: colors.meta }}>{level === 'local' ? '[n] votes' : '[n] bills'}</Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={[type.meta]}>Party is never shown on bill cards. It appears here only after you have voted.</Text>
      </View>

      <View style={{ gap: 10, paddingTop: 8 }}>
        <PillButton label="Sign out" variant="outline" onPress={confirmSignOut} />
        {error && (
          <Text style={type.meta} selectable>
            {error}
          </Text>
        )}
      </View>
    </TabScreen>
  );
}

const STATE_NAMES: Record<string, string> = { TX: 'Texas' };
function profileStateName(state: string | null | undefined) {
  return state ? (STATE_NAMES[state] ?? state) : '';
}

// Names stay placeholders until member-level votes are loaded for each body.
function lawmakers(level: Level, profile: ReturnType<typeof useMe>['profile']) {
  const d = profile?.districts;
  const state = profileStateName(profile?.state) || 'State';
  if (level === 'state') {
    return [
      { name: '[State senator]', role: `${state} Senate, District ${d?.stateSenate ?? '[##]'}` },
      { name: '[State representative]', role: `${state} House, District ${d?.stateHouse ?? '[##]'}` },
      { name: '[Lawmaker you agree with most]', role: `${state} House, any district` },
    ];
  }
  if (level === 'federal') {
    return [
      { name: '[U.S. senator]', role: `U.S. Senate, ${state}` },
      { name: '[U.S. senator]', role: `U.S. Senate, ${state}` },
      { name: '[U.S. representative]', role: `U.S. House, ${state} District ${d?.congress ?? '[##]'}` },
    ];
  }
  const city = profile?.city ?? '[City]';
  return [
    { name: '[Council member]', role: `${city} City Council, District [#]` },
    { name: '[Mayor]', role: `Mayor of ${city}` },
    { name: '[County commissioner]', role: `${profile?.county ?? '[County]'}, Precinct [#]` },
  ];
}

function PillTab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Text
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      suppressHighlighting
      style={{
        height: 36,
        lineHeight: 33,
        paddingHorizontal: 18,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: on ? colors.ink : colors.outline,
        backgroundColor: on ? colors.ink : colors.ground,
        color: on ? colors.ground : colors.ink,
        fontSize: 14,
        fontWeight: '700',
      }}>
      {label}
    </Text>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={type.stat}>{value}</Text>
      <Text style={{ fontSize: 12, lineHeight: 15, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontWeight: '700' }}>{children}</Text>;
}

function GameRow({ color, game, children }: { color: string; game: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: color }}>
      <Text style={{ flex: 1, fontFamily: fonts.serif700, fontSize: 19 }}>{game}</Text>
      <Text style={{ fontSize: 14 }}>{children}</Text>
    </View>
  );
}

function WeekStrip({ today, played }: { today: string; played: Set<string> }) {
  // Sunday through Saturday of this Central-time week.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - weekday));
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <View
      accessible
      accessibilityLabel={`This week: played ${days.filter((d) => played.has(d)).length} of ${weekday + 1} days so far`}
      style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 }}>
      {days.map((d, i) => {
        const isToday = d === today;
        const done = played.has(d);
        const future = d > today;
        return (
          <View key={d} style={{ alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '700' }}>{letters[i]}</Text>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                backgroundColor: done ? colors.ink : isToday ? colors.lavender : future ? colors.ground : colors.muted,
                borderWidth: isToday && !done ? 2 : future ? 1.5 : 0,
                borderColor: isToday ? colors.ink : colors.hairline,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function IssueRow({ name, yeaPct, votes }: { name: string; yeaPct: number; votes: number }) {
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${name}: ${yeaPct}% Yea across ${votes} bills`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{name}</Text>
        <Text style={{ fontSize: 13, color: colors.meta, fontVariant: ['tabular-nums'] }}>
          {yeaPct}% Yea, {votes} {votes === 1 ? 'bill' : 'bills'}
        </Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.hairline }}>
        <View style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 16, backgroundColor: colors.track }} />
        <View
          style={{
            position: 'absolute',
            top: -4,
            left: `${yeaPct}%`,
            marginLeft: -9,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.ink,
            borderWidth: 2,
            borderColor: colors.ground,
            outlineWidth: 1.5,
            outlineColor: colors.ink,
            outlineStyle: 'solid',
          }}
        />
      </View>
    </View>
  );
}

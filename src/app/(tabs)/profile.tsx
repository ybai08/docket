import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { stateDistrictLine } from '@/components/civic';
import { showAlert } from '@/components/dialog';
import { NOT_AFFILIATED, PRIVACY_URL, SUPPORT_URL, TERMS_URL } from '@/components/legal';
import { ChevronRight, FiledOrFakeGlyph, FlameIcon, LandslideGlyph, RollCallGlyph } from '@/components/icons';
import { TabScreen } from '@/components/tab-screen';
import { WeekTiles } from '@/components/week-tiles';
import { authErrorMessage, useAuth } from '@/lib/auth-context';
import { useMe } from '@/lib/me-context';
import { useRemote, type FriendsData } from '@/lib/social';
import { useToday } from '@/lib/use-today';
import { colors, fonts, type } from '@/theme';

type Level = 'state' | 'federal' | 'local';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, stats: serverStats } = useMe();
  const { day, stats, status } = useToday();
  const [level, setLevel] = useState<Level>('federal');
  const { data: lawmakerData } = useRemote<LawmakerData>('/me/lawmakers');
  const { data: friendsData } = useRemote<FriendsData>('/friends');
  // The server spells out the state ("Texas"); fall back to the code until it loads.
  const stateName =
    (profile as { stateName?: string | null } | null)?.stateName || lawmakerData?.stateName || profile?.state || '';
  // Only offer levels that have someone in them.
  const levels = (
    [
      ['state', stateName || 'State'],
      ['federal', 'Congress'],
      ['local', 'Local'],
    ] as [Level, string][]
  ).filter(([id]) => lawmakers(id, lawmakerData).length > 0);
  const current = levels.some(([id]) => id === level) ? level : (levels[0]?.[0] ?? level);
  // Most agreed first; ties go to the one compared on more bills. Lawmakers with no shared votes go last.
  const shown = lawmakers(current, lawmakerData).sort(
    (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.shared ?? 0) - (a.shared ?? 0) || a.name.localeCompare(b.name),
  );
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // Apple's "Hide My Email" gives a random relay address; don't show it as a name.
  const hiddenEmail = user.email?.endsWith('@privaterelay.appleid.com') ?? false;
  const name = profile?.displayName || user.displayName || (!hiddenEmail && user.email?.split('@')[0]) || 'Docket member';
  const where = [
    profile?.city,
    profile?.state && profile.districts ? stateDistrictLine(profile.state, stateName, profile.districts) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const since = new Date(profile?.createdAt ?? user.metadata.creationTime ?? `${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  function confirmSignOut() {
    showAlert('Sign out of Docket?', 'You can sign back in anytime with Apple or Google.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut().catch((err) => setError(authErrorMessage(err))),
      },
    ]);
  }

  const byGame = serverStats?.byGame;
  // Today counts as played as soon as any ballot is in, even before the server stats refresh.
  const played = new Set(serverStats?.weekPlayed ?? []);
  if (Object.values(status).some((s) => s.state === 'done')) played.add(day);

  return (
    <TabScreen gap={36}>
      <View style={{ gap: 14 }}>
        <Text style={type.title} accessibilityRole="header">
          Profile
        </Text>

        <VoterCard
          name={name}
          where={where}
          since={since}
          daysPlayed={serverStats?.daysPlayed ?? stats.rollCallsPlayed}
          billsVoted={serverStats?.billsVoted ?? 0}
          friends={friendsData?.friends.length ?? null}
          streak={stats.currentStreak}
          best={stats.maxStreak}
          today={day}
          played={played}
        />
      </View>

      <Section title="By game">
        <View style={{ gap: 10 }}>
          <GameRow
            id="roll-call"
            color={colors.lavender}
            glyph={<RollCallGlyph size={36} />}
            game="Roll Call"
            caption="Agreed with the final vote"
            value={byGame?.rollCallAgreementPct != null ? `${byGame.rollCallAgreementPct}%` : null}
          />
          <GameRow
            id="filed-or-fake"
            color={colors.yellow}
            glyph={<FiledOrFakeGlyph size={36} />}
            game="Filed or Fake"
            caption="Spotted correctly"
            value={byGame?.filedOrFakePct != null ? `${byGame.filedOrFakePct}%` : null}
          />
          <GameRow
            id="landslide"
            color={colors.teal}
            glyph={<LandslideGlyph size={36} />}
            game="Landslide"
            caption="Average points"
            value={byGame?.landslideAvg != null ? `${byGame.landslideAvg}/12` : null}
          />
        </View>
      </Section>

      <Section title="Issues you care about" note="From your Roll Call votes, most-voted topics first">
        {serverStats?.issues.length ? (
          <View style={{ gap: 22 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: -8,
              }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text2 }}>Mostly Nay</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text2 }}>Mostly Yea</Text>
            </View>
            {serverStats.issues.slice(0, 4).map((i) => (
              <IssueRow key={i.topic} name={i.topic} yeaPct={i.yeaPct} votes={i.votes} />
            ))}
          </View>
        ) : (
          <Empty>Play a Roll Call to see where you lean on each topic.</Empty>
        )}
      </Section>

      <Section title="Lawmakers you agree with" note="Compared on the bills you both voted on">
        {levels.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
            {levels.map(([id, label]) => (
              <PillTab key={id} label={label} on={current === id} onPress={() => setLevel(id)} />
            ))}
          </View>
        )}
        {shown.length ? (
          <View>
            {shown.map((p, i) => (
              <LawmakerItem key={i} row={p} local={current === 'local'} />
            ))}
          </View>
        ) : (
          <Empty>
            {lawmakerData ? 'No lawmakers to compare for your area yet.' : 'Loading your lawmakers'}
          </Empty>
        )}
        <View style={{ gap: 6 }}>
          <Text style={type.meta}>Party is never shown on bill cards. It appears here only after you have voted.</Text>
          {current === 'local' && lawmakerData?.credit ? (
            <Text style={{ fontSize: 11, color: colors.meta }}>{lawmakerData.credit}</Text>
          ) : null}
        </View>
      </Section>

      <View style={{ borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' }}>
        <SettingsRow label="Privacy" onPress={() => router.push('/privacy')} chevron />
        <View
          style={{
            height: 1,
            backgroundColor: colors.hairline,
            marginLeft: 16,
          }}
        />
        <SettingsRow label="Sign out" onPress={confirmSignOut} />
      </View>
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 }}>
          <FooterLink label="Privacy Policy" url={PRIVACY_URL} />
          <FooterLink label="Terms of Use" url={TERMS_URL} />
          <FooterLink label="Support" url={SUPPORT_URL} />
        </View>
        <Text style={{ fontSize: 12, lineHeight: 17, color: colors.meta }}>{NOT_AFFILIATED}</Text>
      </View>
      {error && (
        <Text style={type.meta} selectable>
          {error}
        </Text>
      )}
    </TabScreen>
  );
}

const NOTCH = 18;

/** A voter-registration style card: who you are on top, your streak on a tear-off stub below. */
function VoterCard(props: {
  name: string;
  where: string;
  since: string;
  daysPlayed: number;
  billsVoted: number;
  friends: number | null;
  streak: number;
  best: number;
  today: string;
  played: Set<string>;
}) {
  const { name, where, since, streak, best } = props;
  return (
    <View
      style={{
        borderWidth: 2,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: colors.ground,
        overflow: 'hidden',
      }}>
      <View style={{ padding: 18, gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              borderWidth: 2,
              backgroundColor: colors.lavender,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text
              style={{
                fontFamily: fonts.serif800,
                fontSize: 30,
                lineHeight: 34,
              }}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontFamily: fonts.serif800,
                fontSize: 28,
                lineHeight: 31,
                letterSpacing: -0.3,
              }}
              numberOfLines={2}>
              {name}
            </Text>
            {where ? <Text style={{ fontSize: 14, color: colors.text2 }}>{where}</Text> : null}
            <Text style={type.meta}>Playing since {since}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Figure value={String(props.daysPlayed)} label="Days played" />
          <Figure value={String(props.billsVoted)} label="Bills voted" divider />
          <Figure
            value={props.friends === null ? '–' : String(props.friends)}
            label={props.friends === 1 ? 'Friend' : 'Friends'}
            divider
          />
        </View>
      </View>

      {/* Tear-off stub: a dashed rule with half-circle notches cut into both edges. */}
      <View>
        <Svg height={2} width="100%">
          <Line x1="0" y1="1" x2="100%" y2="1" stroke={colors.dashed} strokeWidth={2} strokeDasharray="6 4" />
        </Svg>
        <View style={[notch, { left: -NOTCH / 2 - 2 }]} />
        <View style={[notch, { right: -NOTCH / 2 - 2 }]} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 18,
          paddingVertical: 14,
          gap: 12,
        }}>
        <View style={{ gap: 2 }} accessible accessibilityLabel={`${streak}-day streak. Best streak ${best} days.`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FlameIcon size={18} />
            <Text
              style={{
                fontSize: 17,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
              }}>
              {streak}-day streak
            </Text>
          </View>
          <Text style={[type.meta, { fontVariant: ['tabular-nums'] }]}>Best: {best} days</Text>
        </View>
        <WeekTiles today={props.today} played={props.played} />
      </View>
    </View>
  );
}

const notch = {
  position: 'absolute' as const,
  top: -NOTCH / 2 + 1,
  width: NOTCH,
  height: NOTCH,
  borderRadius: NOTCH / 2,
  borderWidth: 2,
  backgroundColor: colors.ground,
};

function Figure({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        gap: 2,
        paddingLeft: divider ? 14 : 0,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: colors.hairline,
      }}>
      <Text style={{ fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, lineHeight: 15, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 24, lineHeight: 28 }} accessibilityRole="header">
          {title}
        </Text>
        {note ? <Text style={{ fontSize: 14, color: colors.meta }}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function GameRow({
  id,
  color,
  glyph,
  game,
  caption,
  value,
}: {
  id: 'roll-call' | 'filed-or-fake' | 'landslide';
  color: string;
  glyph: ReactNode;
  game: string;
  caption: string;
  value: string | null;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game}: ${value ?? 'not played yet'}, ${caption.toLowerCase()}`}
      accessibilityHint="Opens your history"
      onPress={() => router.push({ pathname: '/history/[game]', params: { game: id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingLeft: 14,
        paddingRight: 10,
        borderRadius: 12,
        backgroundColor: color,
        opacity: pressed ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      {glyph}
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: fonts.serif700, fontSize: 19 }}>{game}</Text>
        <Text style={{ fontSize: 13, color: colors.text2 }}>{caption}</Text>
      </View>
      <Text
        style={{
          fontSize: 26,
          fontWeight: '600',
          fontVariant: ['tabular-nums'],
        }}>
        {value ?? '–'}
      </Text>
      <ChevronRight size={16} />
    </Pressable>
  );
}

function IssueRow({ name, yeaPct, votes }: { name: string; yeaPct: number; votes: number }) {
  return (
    <View style={{ gap: 10 }} accessible accessibilityLabel={`${name}: ${yeaPct}% Yea across ${votes} bills`}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>{name}</Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.meta,
            fontVariant: ['tabular-nums'],
          }}>
          {yeaPct}% Yea, {votes} {votes === 1 ? 'bill' : 'bills'}
        </Text>
      </View>
      {/* Inset by the dot's radius so a 0% or 100% lean stays inside the track. */}
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.hairline,
          marginHorizontal: 9,
        }}>
        <View
          style={{
            position: 'absolute',
            left: '50%',
            top: -4,
            width: 2,
            height: 14,
            backgroundColor: colors.track,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: -6,
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

function LawmakerItem({ row: p, local }: { row: LawmakerRow; local: boolean }) {
  const initials = p.real
    ? p.name
        .replace(/"[^"]*"/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 1)
        .concat(
          p.name
            .split(/\s+/)
            .slice(-1)
            .map((w) => w[0]),
        )
        .join('')
    : '';
  const unit = local ? 'votes' : 'bills';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens their page"
      disabled={!p.id}
      onPress={() => p.id && router.push({ pathname: '/lawmaker/[id]', params: { id: p.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        opacity: pressed ? 0.6 : 1,
      })}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: colors.muted,
          borderWidth: 1.5,
          borderColor: p.photo ? colors.ink : colors.outline,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text2 }}>{initials}</Text>
        {p.photo ? (
          <Image
            source={{ uri: p.photo }}
            accessibilityIgnoresInvertColors
            contentFit="cover"
            contentPosition="top"
            transition={150}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ gap: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600' }}>
            {p.name}
            {p.party ? <Text style={{ fontWeight: '400', color: colors.meta }}>{`, ${PARTY[p.party] ?? p.party}`}</Text> : null}
          </Text>
          <Text style={type.meta}>{p.role}</Text>
        </View>
        {p.real && p.pct != null ? (
          // Teal for agreed on a light grey track, like the Friends bars.
          <View
            style={{
              flexDirection: 'row',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              marginTop: 2,
            }}>
            <View style={{ flex: p.pct, backgroundColor: colors.teal }} />
            <View style={{ flex: 100 - p.pct, backgroundColor: colors.muted }} />
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 64 }}>
        <Text style={{ fontSize: 22, fontVariant: ['tabular-nums'] }}>
          {p.real ? (p.pct == null ? '–' : `${p.pct}%`) : '[%]'}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.meta,
            fontVariant: ['tabular-nums'],
          }}>
          {p.shared
            ? `of ${p.shared} ${p.shared === 1 ? unit.slice(0, -1) : unit}`
            : p.recorded
              ? 'Vote to compare'
              : 'No votes on file'}
        </Text>
      </View>
    </Pressable>
  );
}

function FooterLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} hitSlop={8}>
      <Text style={{ fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

function SettingsRow({ label, onPress, chevron }: { label: string; onPress: () => void; chevron?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 15,
        paddingHorizontal: 16,
        backgroundColor: pressed ? colors.muted : colors.ground,
      })}>
      <Text style={{ fontSize: 16, fontWeight: '600' }}>{label}</Text>
      {chevron ? <ChevronRight size={16} /> : null}
    </Pressable>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: colors.muted,
        fontSize: 14,
        lineHeight: 19,
        color: colors.text2,
      }}>
      {children}
    </Text>
  );
}

const PARTY: Record<string, string> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
};

type LawmakerRow = {
  id?: string;
  name: string;
  role: string;
  party?: string | null;
  pct?: number | null;
  shared?: number;
  /** How many of Docket's bills this lawmaker has a recorded vote on. */
  recorded?: number;
  real?: boolean;
  photo?: string | null;
};
type LawmakerData = {
  federal: LawmakerRow[];
  state: LawmakerRow[];
  local: LawmakerRow[];
  credit?: string | null;
  stateName?: string | null;
};

// Your lawmakers from the server's lawmakers table, by your districts. Seats we have no one for (county
// commissioners, vacancies) are simply absent rather than shown blank.
function lawmakers(level: Level, data: LawmakerData | null): LawmakerRow[] {
  if (level === 'federal') return (data?.federal ?? []).map((r) => ({ ...r, real: true }));
  if (level === 'local') return (data?.local ?? []).map((r) => ({ ...r, real: true }));
  return (data?.state ?? []).map((r) => ({ ...r, real: true }));
}

function PillTab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        height: 36,
        paddingHorizontal: 18,
        borderRadius: 18,
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: on ? colors.ink : colors.outline,
        backgroundColor: on ? colors.ink : colors.ground,
      }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: on ? colors.ground : colors.ink,
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

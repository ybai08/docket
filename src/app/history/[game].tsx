import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChevronRight, FiledOrFakeGlyph, LandslideGlyph, RollCallGlyph } from '@/components/icons';
import { PillButton } from '@/components/pill-button';
import { ScreenHeader } from '@/components/screen-header';
import { BILLS } from '@/data/bills';
import { api } from '@/lib/api';
import { formatDayLong, formatDayShort } from '@/lib/day';
import { useRemote } from '@/lib/social';
import { colors, fonts, type } from '@/theme';

type GameId = 'roll-call' | 'filed-or-fake' | 'landslide';
type Vote = 'yea' | 'nay';
type RollCallBill = { billId: string; number: string; title: string; vote: Vote; agreed: boolean };
type CaptionAnswer = { id: string; text: string; real: boolean; answeredReal: boolean | null; number?: string };
type LandslideItem = { billId: string; number: string; title: string; yourRank: number; realRank: number; points: number };
type Day = {
  day: string;
  score: number;
  outOf: number;
  /** False for days whose set wasn't stored: score only. */
  detail: boolean;
  prompt?: string;
  bills?: RollCallBill[];
  captions?: CaptionAnswer[];
  items?: LandslideItem[];
};
type History = {
  game: GameId;
  summary: { daysPlayed: number; average: number | null; best: number | null; outOf: number };
  days: Day[];
  nextBefore: string | null;
};

const GAMES: Record<
  GameId,
  { title: string; color: string; glyph: ReactNode; unit: (n: number, outOf: number) => string; scoreNote: string; dayOutOf: number }
> = {
  'roll-call': {
    title: 'Roll Call',
    color: colors.lavender,
    glyph: <RollCallGlyph size={36} />,
    unit: (n) => `${n}%`,
    scoreNote: 'agreed with the final vote',
    dayOutOf: 5,
  },
  'filed-or-fake': {
    title: 'Filed or Fake',
    color: colors.yellow,
    glyph: <FiledOrFakeGlyph size={36} />,
    unit: (n, outOf) => `${n}/${outOf}`,
    scoreNote: 'spotted correctly',
    dayOutOf: 8,
  },
  landslide: {
    title: 'Landslide',
    color: colors.teal,
    glyph: <LandslideGlyph size={36} />,
    unit: (n, outOf) => `${n}/${outOf}`,
    scoreNote: 'points',
    dayOutOf: 12,
  },
};

/** Every finished day of one game: a summary, a recent trend, then each day's answers. */
export default function GameHistory() {
  const { game } = useLocalSearchParams<{ game: GameId }>();
  const g = GAMES[game] ?? GAMES['roll-call'];
  const { data, error, reload } = useRemote<History>(`/me/history/${game}`);
  const [older, setOlder] = useState<{ days: Day[]; nextBefore: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<Set<string> | null>(null);

  if (!data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
        <ScreenHeader title={g.title} />
        <View style={{ padding: 24, gap: 12 }}>
          {error ? (
            <>
              <Text style={type.meta}>{error}</Text>
              <PillButton size="md" variant="outline" label="Retry" onPress={reload} />
            </>
          ) : (
            <ActivityIndicator color={colors.ink} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // A day's maximum should never be 0; fall back to the game's usual maximum if the server sends one.
  const days = [...data.days, ...(older?.days ?? [])].map((d) => (d.outOf > 0 ? d : { ...d, outOf: g.dayOutOf }));
  const nextBefore = older ? older.nextBefore : data.nextBefore;
  // The newest day starts open; the rest open on tap.
  const expanded = open ?? new Set(days[0] ? [days[0].day] : []);
  const s = data.summary;

  async function loadOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const page = await api<History>(`/me/history/${game}?before=${nextBefore}`);
      setOlder((o) => ({ days: [...(o?.days ?? []), ...page.days], nextBefore: page.nextBefore }));
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(day: string) {
    const next = new Set(expanded);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setOpen(next);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} edges={['top']}>
      <ScreenHeader title={g.title} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40, gap: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: g.color, alignItems: 'center', justifyContent: 'center' }}>
            {g.glyph}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>Your history</Text>
            <Text style={type.game} accessibilityRole="header">
              {g.title}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row' }}>
          <Figure value={String(s.daysPlayed)} label="Days played" />
          <Figure value={s.average != null ? g.unit(s.average, s.outOf) : '–'} label="Average" divider />
          <Figure value={s.best != null ? g.unit(s.best, s.outOf) : '–'} label="Best" divider />
        </View>

        {days.length > 1 && <Trend days={days.slice(0, 14).reverse()} color={g.color} />}

        {days.length === 0 ? (
          <Text style={{ padding: 14, borderRadius: 12, backgroundColor: colors.muted, fontSize: 14, color: colors.text2 }}>
            {`Finish a game of ${g.title} and it will show up here.`}
          </Text>
        ) : (
          <View>
            {days.map((d, i) => (
              <DayBlock
                key={d.day}
                game={game}
                day={d}
                color={g.color}
                note={g.scoreNote}
                first={i === 0}
                open={expanded.has(d.day)}
                onToggle={() => toggle(d.day)}
              />
            ))}
          </View>
        )}

        {nextBefore ? (
          <PillButton label="Show older days" variant="outline" busy={loadingMore} style={{ alignSelf: 'stretch', height: 48 }} onPress={loadOlder} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Figure({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2, paddingLeft: divider ? 14 : 0, borderLeftWidth: divider ? 1 : 0, borderLeftColor: colors.hairline }}>
      <Text style={{ fontSize: 28, lineHeight: 32, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 12, lineHeight: 15, color: colors.text2 }}>{label}</Text>
    </View>
  );
}

/** The last two weeks of scores as columns, oldest on the left. */
function Trend({ days, color }: { days: Day[]; color: string }) {
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`Scores for your last ${days.length} games`}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.meta }}>Recent games</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 72 }}>
        {days.map((d) => (
          <View
            key={d.day}
            style={{
              flex: 1,
              height: `${Math.min(100, Math.max(4, (d.score / Math.max(1, d.outOf)) * 100))}%`,
              borderRadius: 3,
              backgroundColor: color,
              borderWidth: 1.5,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, color: colors.meta }}>{formatDayShort(days[0].day)}</Text>
        <Text style={{ fontSize: 11, color: colors.meta }}>{formatDayShort(days[days.length - 1].day)}</Text>
      </View>
    </View>
  );
}

function DayBlock(props: { game: GameId; day: Day; color: string; note: string; first: boolean; open: boolean; onToggle: () => void }) {
  const { game, day: d, color, note, first, open, onToggle } = props;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.hairline }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${formatDayLong(d.day)}: ${d.score} of ${d.outOf}, ${note}`}
        onPress={onToggle}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>{formatDayLong(d.day)}</Text>
        <View style={{ minWidth: 56, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {d.score}/{d.outOf}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <ChevronRight size={14} color={colors.meta} />
        </View>
      </Pressable>
      {open && (
        <View style={{ paddingBottom: 14, gap: 2 }}>
          {!d.detail ? (
            <Text style={type.meta}>{"This day's answers weren't saved, only the score."}</Text>
          ) : game === 'roll-call' ? (
            d.bills?.map((b) => <RollCallLine key={b.billId} bill={b} />)
          ) : game === 'filed-or-fake' ? (
            d.captions?.map((c) => <CaptionLine key={c.id} caption={c} />)
          ) : (
            d.items?.map((it) => <LandslideLine key={it.billId} item={it} />)
          )}
        </View>
      )}
    </View>
  );
}

/** Opens the bill page when the app knows the bill. */
function BillRow({ billId, children }: { billId?: string; children: ReactNode }) {
  const known = !!billId && !!BILLS[billId];
  return (
    <Pressable
      disabled={!known}
      accessibilityHint={known ? 'Opens the bill' : undefined}
      onPress={() => billId && router.push({ pathname: '/bill/[id]', params: { id: billId } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

function Title({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ flex: 1, gap: 1 }}>
      <Text style={{ fontSize: 15, fontWeight: '600' }}>{title}</Text>
      {sub ? <Text style={{ fontSize: 12, color: colors.meta }}>{sub}</Text> : null}
    </View>
  );
}

function Pill({ label, color, outline }: { label: string; color?: string; outline?: boolean }) {
  return (
    <View
      style={{
        minWidth: 52,
        height: 26,
        paddingHorizontal: 9,
        borderRadius: 13,
        backgroundColor: color ?? colors.ground,
        borderWidth: outline ? 1.5 : 0,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function RollCallLine({ bill: b }: { bill: RollCallBill }) {
  return (
    <BillRow billId={b.billId}>
      <Title title={b.title} sub={`${b.number} · ${b.agreed ? 'You agreed with the result' : 'You voted against the result'}`} />
      <Pill label={b.vote === 'yea' ? 'Yea' : 'Nay'} color={b.vote === 'yea' ? colors.teal : colors.lavender} />
    </BillRow>
  );
}

function CaptionLine({ caption: c }: { caption: CaptionAnswer }) {
  const right = c.answeredReal === c.real;
  const said = c.answeredReal == null ? 'No answer' : c.answeredReal ? 'You said Filed' : 'You said Fake';
  return (
    <BillRow billId={c.real ? c.id : undefined}>
      <Title title={c.text} sub={`${said} · ${right ? 'right' : 'wrong'}`} />
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: c.real ? colors.ink : colors.fakeInk,
        }}>
        <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: c.real ? colors.ink : colors.fakeInk }}>
          {c.real ? (c.number ?? 'FILED') : 'FAKE'}
        </Text>
      </View>
    </BillRow>
  );
}

function LandslideLine({ item: it }: { item: LandslideItem }) {
  return (
    <BillRow billId={it.billId}>
      <Text style={{ width: 22, fontFamily: fonts.serif800, fontSize: 17 }}>{it.yourRank}</Text>
      <Title title={it.title} sub={`${it.number} · Really #${it.realRank}`} />
      <Pill label={`+${it.points}`} color={it.points === 3 ? colors.teal : undefined} outline={it.points !== 3} />
    </BillRow>
  );
}

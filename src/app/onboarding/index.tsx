import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Text, TextInput, View } from 'react-native';

import { OnboardFrame, TextLink } from '@/components/onboard-frame';
import { PillButton } from '@/components/pill-button';
import { api } from '@/lib/api';
import { useMe, type Location } from '@/lib/me-context';
import { colors, type } from '@/theme';

export default function OnboardLocation() {
  const { profile, saveLocation } = useMe();
  const [zip, setZip] = useState(profile?.zip ?? '');
  const [preview, setPreview] = useState<Location | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setLookup('loading');
      api<Location>(`/geo/${zip}`)
        .then((loc) => {
          if (cancelled) return;
          setPreview(loc);
          setLookup('idle');
          setError(null);
        })
        .catch((err: Error) => {
          if (cancelled) return;
          setPreview(null);
          setLookup('error');
          setError(err.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [zip]);

  async function next() {
    setSaving(true);
    try {
      await saveLocation(zip);
      router.push('/onboarding/issues');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const shown = /^\d{5}$/.test(zip) ? preview : null;

  return (
    <OnboardFrame
      step={1}
      title="Where do you vote?"
      intro="Your ZIP code sets your state, county and city. Every ballot mixes Congress, your statehouse and decisions made near you."
      footer={
        <>
          <PillButton label="Continue" style={{ alignSelf: 'stretch' }} disabled={!shown} busy={saving} onPress={next} />
          <TextLink label="Skip, show Congress only" onPress={() => router.push('/onboarding/issues')} />
        </>
      }>
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 14, fontWeight: '700' }} nativeID="zip-label">
          ZIP code
        </Text>
        <TextInput
          value={zip}
          onChangeText={(t) => {
            const next = t.replace(/\D/g, '').slice(0, 5);
            setZip(next);
            if (next.length === 5) Keyboard.dismiss();
          }}
          keyboardType="number-pad"
          textContentType="postalCode"
          autoComplete="postal-code"
          placeholder="78705"
          placeholderTextColor={colors.outline}
          accessibilityLabelledBy="zip-label"
          maxLength={5}
          style={{
            height: 52,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 2,
            fontSize: 20,
            letterSpacing: 2,
            fontVariant: ['tabular-nums'],
            color: colors.ink,
          }}
        />
        <Text style={type.meta}>We save your state and districts, never your address.</Text>
      </View>

      {lookup === 'loading' && <ActivityIndicator color={colors.ink} style={{ alignSelf: 'flex-start' }} />}
      {error && <Text style={[type.meta, { color: colors.ink }]}>{error}</Text>}

      {shown && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={type.section}>Your ballots will cover</Text>
            <Text style={type.meta}>
              {shown.zip}: {shown.city ? `${shown.city}, ` : ''}
              {shown.stateName}
            </Text>
          </View>
          <Coverage
            badge="US"
            color={colors.yellow}
            title="U.S. Congress"
            detail={`Your 2 senators and the rep for ${shown.state}-${shown.districts.congress ?? '[##]'}`}
          />
          <Coverage
            badge={shown.state}
            color={colors.lavender}
            title={`${shown.stateName} Legislature`}
            detail={`House District ${shown.districts.stateHouse ?? '[##]'}, Senate District ${shown.districts.stateSenate ?? '[##]'}`}
          />
          {shown.county && <Coverage badge="CTY" color={colors.teal} title={shown.county} detail="Commissioners Court" />}
          {shown.city && (
            <Coverage
              badge={shown.city === 'Austin' ? 'ATX' : shown.city.slice(0, 3).toUpperCase()}
              color={colors.teal}
              title={`City of ${shown.city}`}
              detail={shown.districts.council ? `City Council District ${shown.districts.council}, plus the mayor` : 'City Council and the mayor'}
            />
          )}
          {shown.split.length > 0 && (
            <Text style={type.meta}>Your ZIP spans more than one district, so we use the one that covers most of it.</Text>
          )}
        </View>
      )}
    </OnboardFrame>
  );
}

function Coverage({ badge, color, title, detail }: { badge: string; color: string; title: string; detail: string }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: color }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: colors.ground,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ fontSize: badge.length > 2 ? 11 : 12, fontWeight: '800' }}>{badge}</Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Text style={{ fontSize: 13, color: colors.text2 }}>{detail}</Text>
      </View>
    </View>
  );
}

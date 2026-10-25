import { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, Text } from 'react-native';

import { colors, fonts, type } from '@/theme';

// Native dialogs (Alert, ActionSheetIOS, Alert.prompt) do nothing on the web build: react-native-web's
// Alert is a no-op. These helpers keep the native dialogs on iOS and stand in on the web: the browser's
// alert, confirm and prompt for simple cases, and DialogHost's in-app sheet when there are several choices.

export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

type Pending = { title?: string; message?: string; buttons: DialogButton[] };
let present: ((d: Pending) => void) | null = null;

const web = Platform.OS === 'web';
const joined = (title?: string, message?: string) => [title, message].filter(Boolean).join('\n\n');

/** Drop-in for Alert.alert. */
export function showAlert(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }]) {
  if (!web) return Alert.alert(title, message, buttons);
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const cancel = buttons.find((b) => b.style === 'cancel');
  if (actions.length <= 1 && !cancel) {
    window.alert(joined(title, message));
    actions[0]?.onPress?.();
  } else if (actions.length === 1) {
    if (window.confirm(`${joined(title, message)}\n\nOK: ${actions[0].text}`)) actions[0].onPress?.();
    else cancel?.onPress?.();
  } else {
    present?.({ title, message, buttons });
  }
}

/** A list of choices with a cancel button: an action sheet on iOS, the in-app sheet on the web. */
export function showOptions(opts: { title?: string; message?: string; options: DialogButton[]; cancelText?: string }) {
  const { title, message, options, cancelText = 'Cancel' } = opts;
  if (Platform.OS === 'ios') {
    const labels = [...options.map((o) => o.text), cancelText];
    const destructive = options.flatMap((o, i) => (o.style === 'destructive' ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: labels, cancelButtonIndex: options.length, destructiveButtonIndex: destructive },
      (i) => options[i]?.onPress?.(),
    );
    return;
  }
  showAlert(title ?? '', message, [...options, { text: cancelText, style: 'cancel' }]);
}

/** Drop-in for Alert.prompt (iOS only) that also works on the web. */
export function showPrompt(title: string, message: string | undefined, onSubmit: (value: string) => void, defaultValue = '') {
  if (web) {
    const value = window.prompt(joined(title, message), defaultValue);
    if (value != null) onSubmit(value);
    return;
  }
  Alert.prompt(title, message, onSubmit, 'plain-text', defaultValue);
}

/** Renders web dialogs with several choices. Mounted once at the root; does nothing on iOS. */
export function DialogHost() {
  const [dialog, setDialog] = useState<Pending | null>(null);

  useEffect(() => {
    if (!web) return;
    present = setDialog;
    return () => {
      present = null;
    };
  }, []);

  if (!dialog) return null;
  const close = (b?: DialogButton) => {
    setDialog(null);
    b?.onPress?.();
  };
  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  const actions = dialog.buttons.filter((b) => b !== cancel);

  return (
    <Modal transparent animationType="fade" onRequestClose={() => close(cancel)}>
      <Pressable
        onPress={() => close(cancel)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}
        accessibilityLabel="Close">
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: colors.ground, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, gap: 10 }}>
          {dialog.title ? (
            <Text style={{ fontFamily: fonts.serif700, fontSize: 22, textAlign: 'center' }} accessibilityRole="header">
              {dialog.title}
            </Text>
          ) : null}
          {dialog.message ? <Text style={[type.body, { color: colors.text2, textAlign: 'center', marginBottom: 6 }]}>{dialog.message}</Text> : null}
          {actions.map((b) => (
            <Choice key={b.text} label={b.text} destructive={b.style === 'destructive'} onPress={() => close(b)} />
          ))}
          {cancel ? <Choice label={cancel.text} outline onPress={() => close(cancel)} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Choice({ label, destructive, outline, onPress }: { label: string; destructive?: boolean; outline?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        height: 50,
        borderRadius: 999,
        borderWidth: outline || destructive ? 2 : 0,
        backgroundColor: outline || destructive ? colors.ground : colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: outline || destructive ? colors.ink : colors.ground }}>{label}</Text>
    </Pressable>
  );
}

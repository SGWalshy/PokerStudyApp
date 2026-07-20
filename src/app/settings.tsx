import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CurrencyPickerModal } from '@/components/settings/currency-picker-modal';
import { EditTextModal } from '@/components/settings/edit-text-modal';
import { TimePickerModal } from '@/components/settings/time-picker-modal';
import { Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';
import { currencyLabel } from '@/utils/currency';
import { buildExportSummary } from '@/utils/export-data';
import { NotificationPrefs } from '@/utils/settings-storage';

const C = Colors.light;
const CONTACT_EMAIL = 'support@pokerstudyapp.com';

function formatReminderTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const isPM = h >= 12;
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { hands, bankroll, startingBankroll, stats, profile, setProfile, currency, setCurrency, notificationPrefs, setNotificationPrefs, resetAllData } = useAppData();

  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  function updateNotificationPrefs(updates: Partial<NotificationPrefs>) {
    setNotificationPrefs({ ...notificationPrefs, ...updates });
  }

  async function handleExport() {
    const summary = buildExportSummary(hands, bankroll, startingBankroll, stats.bankrollTotals.current, currency);
    try {
      await Share.share({ message: summary, title: 'Poker Study Data Export' });
    } catch {
      // User cancelled or share sheet unavailable — nothing to do
    }
  }

  function handleClearData() {
    Alert.alert(
      'Are you sure?',
      'This will permanently delete all your hands, sessions and bankroll data.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { resetAllData(); } },
      ]
    );
  }

  function comingSoon(feature: string) {
    Alert.alert(feature, 'Coming soon.');
  }

  function handleContactUs() {
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Poker%20Study%20App`).catch(() => {});
  }

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Section title="Profile">
            <Row
              label="Name"
              value={profile.name || 'Not set'}
              chevron
              onPress={() => setEditingName(true)}
            />
            <Divider />
            <Row
              label="Email"
              value={profile.email || 'Not set'}
              chevron
              last
              onPress={() => setEditingEmail(true)}
            />
          </Section>

          <Section title="Currency">
            <Row
              label="Currency"
              value={currencyLabel(currency)}
              chevron
              last
              onPress={() => setShowCurrencyPicker(true)}
            />
          </Section>

          <Section title="Notifications">
            <ToggleRow
              label="Daily study reminder"
              value={notificationPrefs.dailyReminder}
              onChange={(v) => updateNotificationPrefs({ dailyReminder: v })}
            />
            {notificationPrefs.dailyReminder && (
              <>
                <Divider />
                <Row
                  label="Reminder time"
                  value={formatReminderTime(notificationPrefs.reminderTime)}
                  chevron
                  onPress={() => setShowTimePicker(true)}
                />
              </>
            )}
            <Divider />
            <ToggleRow
              label="Weekly goal reminder"
              value={notificationPrefs.weeklyGoalReminder}
              onChange={(v) => updateNotificationPrefs({ weeklyGoalReminder: v })}
            />
            <Divider />
            <ToggleRow
              label="Streak at risk warning"
              value={notificationPrefs.streakAtRiskWarning}
              onChange={(v) => updateNotificationPrefs({ streakAtRiskWarning: v })}
              last
            />
          </Section>

          <Section title="Data">
            <Row label="Export my data" chevron onPress={handleExport} />
            <Divider />
            <Row label="Clear all data" danger last onPress={handleClearData} />
          </Section>

          <Section title="Subscription">
            <Row label="Current plan" value="Free Plan" last={false} />
            <View style={styles.subscriptionActions}>
              <Pressable
                onPress={() => comingSoon('Upgrade to Pro')}
                style={({ pressed }) => [styles.upgradeBtn, pressed && styles.dimmed]}>
                <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
              </Pressable>
              <Pressable
                onPress={() => comingSoon('Restore Purchases')}
                style={({ pressed }) => [styles.restoreBtn, pressed && styles.dimmed]}>
                <Text style={styles.restoreBtnText}>Restore purchases</Text>
              </Pressable>
            </View>
          </Section>

          <Section title="About">
            <Row label="App version" value={appVersion} />
            <Divider />
            <Row label="Privacy policy" chevron onPress={() => comingSoon('Privacy Policy')} />
            <Divider />
            <Row label="Terms of service" chevron onPress={() => comingSoon('Terms of Service')} />
            <Divider />
            <Row label="Contact us" chevron last onPress={handleContactUs} />
          </Section>

          <View style={{ height: Spacing.five }} />
        </ScrollView>
      </SafeAreaView>

      <EditTextModal
        visible={editingName}
        title="Edit Name"
        value={profile.name}
        placeholder="Your name"
        onClose={() => setEditingName(false)}
        onSave={(name) => setProfile({ ...profile, name })}
      />
      <EditTextModal
        visible={editingEmail}
        title="Edit Email"
        value={profile.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        onClose={() => setEditingEmail(false)}
        onSave={(email) => setProfile({ ...profile, email })}
      />
      <CurrencyPickerModal
        visible={showCurrencyPicker}
        value={currency}
        onClose={() => setShowCurrencyPicker(false)}
        onSelect={setCurrency}
      />
      <TimePickerModal
        visible={showTimePicker}
        value={notificationPrefs.reminderTime}
        onClose={() => setShowTimePicker(false)}
        onSave={(reminderTime) => updateNotificationPrefs({ reminderTime })}
      />
    </View>
  );
}

// ── Shared row primitives ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function Row({
  label,
  value,
  chevron,
  danger,
  last,
  onPress,
}: {
  label: string;
  value?: string;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      <View style={styles.rowRight}>
        {value !== undefined && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
        {chevron && <Ionicons name="chevron-forward" size={18} color={C.textSecondary} style={styles.rowChevron} />}
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.dimmed}>
      {content}
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.backgroundSelected, true: C.tint }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.background,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },

  section: {
    marginBottom: Spacing.four,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: C.background,
    marginLeft: Spacing.three,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  rowLast: {},
  rowLabel: {
    fontSize: 15,
    color: C.text,
  },
  rowLabelDanger: {
    color: C.negative,
    fontWeight: '600',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    marginLeft: Spacing.two,
  },
  rowValue: {
    fontSize: 15,
    color: C.textSecondary,
    flexShrink: 1,
    textAlign: 'right',
  },
  rowChevron: {
    marginLeft: 6,
  },

  subscriptionActions: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  upgradeBtn: {
    backgroundColor: C.tint,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  upgradeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.tintText,
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  dimmed: {
    opacity: 0.7,
  },
});

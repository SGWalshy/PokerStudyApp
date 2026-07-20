import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BankrollHistoryChart } from '@/components/bankroll/bankroll-history-chart';
import { DatePickerModal, formatDateReadable } from '@/components/bankroll/date-picker-modal';
import { BottomTabInset, Colors, Spacing } from '@/constants/theme';
import { useAppData } from '@/state/app-data';
import { BankrollTransaction, ExpenseCategory } from '@/utils/bankroll-storage';
import { currencySymbol, formatMoney } from '@/utils/currency';
import { txResult } from '@/utils/stats';

const C = Colors.light;
const WebTopClearance = Platform.OS === 'web' ? 60 : 0;

type AddSheet = 'picker' | 'cash' | 'tournament' | 'deposit' | 'withdrawal' | 'expense' | null;

const ADD_OPTIONS: { key: AddSheet; title: string; description: string }[] = [
  { key: 'cash',       title: 'Cash Game',   description: 'Session result' },
  { key: 'tournament', title: 'Tournament',  description: 'Session result' },
  { key: 'deposit',    title: 'Deposit',     description: 'Added money to bankroll' },
  { key: 'withdrawal', title: 'Withdrawal',  description: 'Took money out' },
  { key: 'expense',    title: 'Expense',     description: 'Food, travel, other costs' },
];

const STAKES_PRESETS: { label: string; bb: number | null }[] = [
  { label: '$1/2',  bb: 2 },
  { label: '$2/5',  bb: 5 },
  { label: '$5/10', bb: 10 },
  { label: 'Other', bb: null },
];

const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'food',      label: 'Food/Drink' },
  { key: 'travel',    label: 'Travel' },
  { key: 'training',  label: 'Training' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'other',     label: 'Other' },
];

function chartLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Accepts "YYYY-MM-DD"; falls back to now if it's missing/malformed so a save
// never silently loses the transaction's date.
function parseDateInput(text: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!match) return new Date().toISOString();
  const [, y, m, d] = match;
  const now = new Date();
  // Keep the current time-of-day (down to milliseconds) so two entries saved
  // for the same date stay distinguishable in time — the bankroll history
  // graph plots points proportionally by timestamp, and entries logged
  // minutes or seconds apart collapsing onto the same instant would flatten
  // the line to a single point.
  const parsed = new Date(
    Number(y), Number(m) - 1, Number(d),
    now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()
  );
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// Keeps digits and at most one decimal point — blocks letters/symbols as the user types.
function sanitizeNumeric(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

// Autofill suggestions for the location/tournament-name field — filters
// previously-used names to those matching what's currently typed, so it
// behaves like a normal autocomplete rather than a static list.
function SavedLocationChips({
  locations, query, onSelect, onRemove,
}: {
  locations: string[];
  query: string;
  onSelect: (location: string) => void;
  onRemove: (location: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const matches = q
    ? locations.filter(loc => loc.toLowerCase().includes(q) && loc.toLowerCase() !== q)
    : locations;
  if (matches.length === 0) return null;
  return (
    <View style={styles.locationChipsSection}>
      <Text style={styles.locationChipsLabel}>{q ? 'Suggestions' : 'Previous Names'}</Text>
      <View style={styles.locationChipsRow}>
        {matches.map(loc => (
          <View key={loc} style={styles.locationChip}>
            <Pressable onPress={() => onSelect(loc)} hitSlop={4}>
              <Text style={styles.locationChipText}>{loc}</Text>
            </Pressable>
            <Pressable onPress={() => onRemove(loc)} hitSlop={8} style={styles.locationChipDelete}>
              <Text style={styles.locationChipDeleteText}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function BankrollScreen() {
  const params = useLocalSearchParams<{ openAdd?: string }>();
  const {
    bankroll, startingBankroll, addTransaction, setStartingBankrollAmount, stats,
    savedLocations, addSavedLocation, removeSavedLocation, currency,
  } = useAppData();
  const symbol = currencySymbol(currency);

  const [addSheet, setAddSheet]     = useState<AddSheet>(null);
  const [datePickerFor, setDatePickerFor] = useState<'cash' | 'tournament' | 'deposit' | 'withdrawal' | null>(null);

  // Cash session form
  const [cashLocation, setCashLocation] = useState('');
  const [cashStakes, setCashStakes]     = useState(STAKES_PRESETS[0].label);
  const [cashSmallBlind, setCashSmallBlind] = useState('');
  const [cashBigBlind, setCashBigBlind]     = useState('');
  const [cashBuyIn, setCashBuyIn]       = useState('');
  const [cashCashOut, setCashCashOut]   = useState('');
  const [cashHours, setCashHours]       = useState('');
  const [cashMinutes, setCashMinutes]   = useState('');
  const [cashDate, setCashDate]         = useState(todayString());
  const [cashNotes, setCashNotes]       = useState('');

  // Tournament form
  const [tourneyLocation, setTourneyLocation]   = useState('');
  const [tourneyBuyIn, setTourneyBuyIn]         = useState('');
  const [tourneyFinish, setTourneyFinish]       = useState('');
  const [tourneyPrize, setTourneyPrize]         = useState('');
  const [tourneyEntrants, setTourneyEntrants]   = useState('');
  const [tourneyHours, setTourneyHours]         = useState('');
  const [tourneyMinutes, setTourneyMinutes]     = useState('');
  const [tourneyDate, setTourneyDate]           = useState(todayString());
  const [tourneyNotes, setTourneyNotes]         = useState('');

  // Deposit / withdrawal form (shared fields, split by addSheet at submit time)
  const [cashFlowAmount, setCashFlowAmount] = useState('');
  const [cashFlowDate, setCashFlowDate]     = useState(todayString());
  const [cashFlowNotes, setCashFlowNotes]   = useState('');

  // Expense form
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount]           = useState('');
  const [expenseCategory, setExpenseCategory]       = useState<ExpenseCategory>('food');
  const [expenseDate, setExpenseDate]               = useState(todayString());

  // Total bankroll edit
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [totalInput, setTotalInput] = useState('');

  useEffect(() => {
    if (params.openAdd === 'session') {
      setAddSheet('picker');
    }
  }, [params.openAdd]);

  // All cash + tournament sessions together, chronological (bankroll is kept
  // sorted newest-first by the context, so this list is too).
  const allSessions = bankroll.filter(tx => tx.type === 'session');

  const bankrollTotal = stats.bankrollTotals.current;
  const { cashStats, tournamentStats } = stats;

  function resetForms() {
    setCashLocation(''); setCashStakes(STAKES_PRESETS[0].label);
    setCashSmallBlind(''); setCashBigBlind('');
    setCashBuyIn(''); setCashCashOut(''); setCashHours(''); setCashMinutes('');
    setCashDate(todayString()); setCashNotes('');

    setTourneyLocation(''); setTourneyBuyIn(''); setTourneyFinish(''); setTourneyPrize('');
    setTourneyEntrants(''); setTourneyHours(''); setTourneyMinutes('');
    setTourneyDate(todayString()); setTourneyNotes('');

    setCashFlowAmount(''); setCashFlowDate(todayString()); setCashFlowNotes('');

    setExpenseDescription(''); setExpenseAmount(''); setExpenseCategory('food'); setExpenseDate(todayString());
  }

  function closeAll() {
    setAddSheet(null);
    setDatePickerFor(null);
    resetForms();
  }

  // The date picker renders as an overlay inside the sheet rather than its
  // own Modal (stacking two native Modals is unreliable), so it doesn't
  // cover the full screen — tapping the dimmed area above the sheet would
  // otherwise still hit the sheet's own backdrop and wipe the whole form.
  // While a date picker is open, that tap should just close the picker
  // (keeping whatever date is currently selected, already live-synced)
  // instead of discarding the in-progress entry.
  function handleSheetBackdropPress() {
    if (datePickerFor) {
      setDatePickerFor(null);
    } else {
      closeAll();
    }
  }

  function submitCashSession() {
    const preset = STAKES_PRESETS.find(p => p.label === cashStakes);
    const stakesLabel = cashStakes === 'Other'
      ? `$${cashSmallBlind || '0'}/$${cashBigBlind || '0'}`
      : cashStakes;
    const bigBlindAmount = cashStakes === 'Other' ? (Number(cashBigBlind) || undefined) : (preset?.bb ?? undefined);
    const decimalHours = (Number(cashHours) || 0) + (Number(cashMinutes) || 0) / 60;
    const location = cashLocation.trim() || 'Session';
    addTransaction({
      type: 'session',
      gameType: 'cash',
      location,
      stakes: stakesLabel,
      bigBlindAmount,
      buyIn: cashBuyIn ? Number(cashBuyIn) : 0,
      cashOut: cashCashOut ? Number(cashCashOut) : 0,
      hours: decimalHours > 0 ? decimalHours : undefined,
      notes: cashNotes.trim() || undefined,
      createdAt: parseDateInput(cashDate),
    });
    addSavedLocation(location);
    closeAll();
  }

  function submitTournament() {
    const location = tourneyLocation.trim() || 'Tournament';
    const buyIn = tourneyBuyIn ? Number(tourneyBuyIn) : 0;
    const totalEntrants = tourneyEntrants ? Number(tourneyEntrants) : undefined;
    const decimalHours = (Number(tourneyHours) || 0) + (Number(tourneyMinutes) || 0) / 60;
    addTransaction({
      type: 'session',
      gameType: 'tournament',
      location,
      buyIn,
      finishPosition: tourneyFinish ? Number(tourneyFinish) : undefined,
      prizeWon: tourneyPrize ? Number(tourneyPrize) : 0,
      totalEntrants,
      hours: decimalHours > 0 ? decimalHours : undefined,
      notes: tourneyNotes.trim() || undefined,
      createdAt: parseDateInput(tourneyDate),
    });
    addSavedLocation(location);
    closeAll();
  }

  function submitExpense() {
    addTransaction({
      type: 'expense',
      category: expenseCategory,
      description: expenseDescription.trim() || undefined,
      amount: expenseAmount ? Number(expenseAmount) : 0,
      createdAt: parseDateInput(expenseDate),
    });
    closeAll();
  }

  // Net of all logged sessions/expenses — the gap between the starting baseline and the current total.
  const netTransactions = stats.bankrollTotals.current - startingBankroll;

  function openTotalEditor() {
    setTotalInput(String(Math.round(stats.bankrollTotals.current)));
    setShowTotalModal(true);
  }

  const totalPreviewAmount = Number(totalInput) || 0;
  const canSaveTotal = totalInput.length > 0;

  function saveTotalBankroll() {
    if (!canSaveTotal) return;
    setStartingBankrollAmount(totalPreviewAmount - netTransactions);
    setShowTotalModal(false);
  }

  const cashFlowAmountNum = Number(cashFlowAmount) || 0;
  const canSaveCashFlow = cashFlowAmountNum > 0;
  const cashFlowPreviewTotal = addSheet === 'withdrawal'
    ? stats.bankrollTotals.current - cashFlowAmountNum
    : stats.bankrollTotals.current + cashFlowAmountNum;

  function submitCashFlow() {
    if (!canSaveCashFlow) return;
    addTransaction({
      type: addSheet === 'withdrawal' ? 'withdrawal' : 'deposit',
      amount: cashFlowAmountNum,
      notes: cashFlowNotes.trim() || undefined,
      createdAt: parseDateInput(cashFlowDate),
    });
    closeAll();
  }

  const cashLiveResult = (Number(cashCashOut) || 0) - (Number(cashBuyIn) || 0);
  const tourneyLiveResult = (Number(tourneyPrize) || 0) - (Number(tourneyBuyIn) || 0);

  function sessionMetaText(tx: BankrollTransaction): string {
    const parts: string[] = [];
    if (tx.gameType === 'tournament') {
      if (tx.buyIn) parts.push(`${formatMoney(tx.buyIn, currency)} buy-in`);
      parts.push(tx.finishPosition ? `Finished #${tx.finishPosition}` : 'No cash');
    } else if (tx.stakes) {
      parts.push(tx.stakes);
    }
    parts.push(chartLabel(tx.createdAt));
    if (tx.hours) parts.push(`${tx.hours.toFixed(tx.hours % 1 === 0 ? 0 : 1)}h`);
    return parts.join(' · ');
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* Scrollable body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Bankroll</Text>
            <Pressable
              onPress={() => setAddSheet('picker')}
              style={({ pressed }) => [styles.addHeaderBtn, pressed && styles.dimmed]}>
              <Text style={styles.addHeaderBtnText}>+ Add</Text>
            </Pressable>
          </View>

          {/* Bankroll card */}
          <Pressable
            onPress={openTotalEditor}
            style={({ pressed }) => [styles.bankrollCard, pressed && styles.dimmed]}>
            <Text style={styles.bankrollLabel}>Total Bankroll</Text>
            <Text style={styles.bankrollAmount}>{formatMoney(bankrollTotal, currency)}</Text>
            <View style={styles.bankrollChangePill}>
              <Text style={styles.bankrollChangeText}>
                {stats.bankrollTotals.weekChange >= 0 ? '+' : '-'}
                {formatMoney(Math.abs(stats.bankrollTotals.weekChange), currency)} this week
              </Text>
            </View>
          </Pressable>

          {/* Stats — cash | tournament, side by side */}
          <View style={styles.statsSection}>
            <View style={styles.statsColumn}>
              <Text style={styles.statsColumnLabel}>Cash</Text>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Win Rate</Text>
                <Text style={styles.miniStatValue}>
                  {cashStats.winRateBBPerHr !== null ? `${cashStats.winRateBBPerHr.toFixed(1)} BB/hr` : '—'}
                </Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Hourly</Text>
                <Text style={styles.miniStatValue}>
                  {cashStats.hourlyRate !== null ? formatMoney(cashStats.hourlyRate, currency) : '—'}
                </Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Sessions</Text>
                <Text style={styles.miniStatValue}>{cashStats.sessionCount || '—'}</Text>
              </View>
            </View>

            <View style={styles.statsDivider} />

            <View style={styles.statsColumn}>
              <Text style={styles.statsColumnLabel}>Tournament</Text>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>ROI</Text>
                <Text style={styles.miniStatValue}>
                  {tournamentStats.roiPct !== null ? `${tournamentStats.roiPct >= 0 ? '+' : ''}${tournamentStats.roiPct.toFixed(0)}%` : '—'}
                </Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>ITM</Text>
                <Text style={styles.miniStatValue}>
                  {tournamentStats.itmPct !== null ? `${tournamentStats.itmPct.toFixed(0)}%` : '—'}
                </Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Tournaments</Text>
                <Text style={styles.miniStatValue}>{tournamentStats.tournamentCount || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Bankroll history — running total over time */}
          <BankrollHistoryChart points={stats.bankrollHistory} currency={currency} />

          {/* Recent sessions */}
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          {allSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>♠</Text>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptySub}>Tap "+ Add" to log your first session</Text>
            </View>
          ) : (
            <View style={styles.sessionList}>
              {allSessions.map((s) => {
                const result = txResult(s);
                const isWin  = result > 0;
                const sign   = isWin ? '+' : '';
                return (
                  <View key={s.id} style={styles.sessionCard}>
                    <View style={styles.sessionLeft}>
                      <View style={styles.sessionTitleRow}>
                        <Text style={styles.sessionLocation}>{s.location}</Text>
                        <Text style={styles.sessionTypeLabel}>
                          {s.gameType === 'tournament' ? 'Tournament' : 'Cash'}
                        </Text>
                      </View>
                      <Text style={styles.sessionMeta}>{sessionMetaText(s)}</Text>
                    </View>
                    <Text style={[styles.sessionResult, isWin ? styles.resultWin : styles.resultLoss]}>
                      {sign}{formatMoney(Math.abs(result), currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={{ height: BottomTabInset + Spacing.six }} />
        </ScrollView>
      </SafeAreaView>

      {/* Bottom sheet: option picker */}
      <Modal
        visible={addSheet === 'picker'}
        transparent
        animationType="slide"
        onRequestClose={closeAll}>
        <Pressable style={styles.modalOverlay} onPress={closeAll} />
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Transaction</Text>

            <View style={styles.optionCardList}>
              {ADD_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setAddSheet(opt.key)}
                  style={({ pressed }) => [styles.optionCard, pressed && styles.dimmed]}>
                  <Text style={styles.optionCardTitle}>{opt.title}</Text>
                  <Text style={styles.optionCardDesc}>{opt.description}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
        </View>
      </Modal>

      {/* Bottom sheet: cash game session */}
      <Modal
        visible={addSheet === 'cash'}
        transparent
        animationType="slide"
        onRequestClose={handleSheetBackdropPress}>
        <Pressable style={styles.modalOverlay} onPress={handleSheetBackdropPress} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Cash Game</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.formInput} placeholder="e.g. Aria" placeholderTextColor={C.textSecondary}
              value={cashLocation} onChangeText={setCashLocation}
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            <SavedLocationChips
              locations={savedLocations}
              query={cashLocation}
              onSelect={setCashLocation}
              onRemove={removeSavedLocation}
            />

            <Text style={styles.fieldLabel}>Stakes</Text>
            <View style={styles.pickerRow}>
              {STAKES_PRESETS.map(p => (
                <Pressable
                  key={p.label}
                  onPress={() => setCashStakes(p.label)}
                  style={[styles.pickerPill, cashStakes === p.label && styles.pickerPillActive]}>
                  <Text style={[styles.pickerPillText, cashStakes === p.label && styles.pickerPillTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {cashStakes === 'Other' && (
              <View style={styles.formRow}>
                <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Small Blind" placeholderTextColor={C.textSecondary}
                  value={cashSmallBlind} onChangeText={t => setCashSmallBlind(sanitizeNumeric(t))} keyboardType="decimal-pad"
                  returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
                <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Big Blind" placeholderTextColor={C.textSecondary}
                  value={cashBigBlind} onChangeText={t => setCashBigBlind(sanitizeNumeric(t))} keyboardType="decimal-pad"
                  returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              </View>
            )}

            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder={`Buy-in ${symbol}`} placeholderTextColor={C.textSecondary}
                value={cashBuyIn} onChangeText={t => setCashBuyIn(sanitizeNumeric(t))} keyboardType="decimal-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder={`Cash-out ${symbol}`} placeholderTextColor={C.textSecondary}
                value={cashCashOut} onChangeText={t => setCashCashOut(sanitizeNumeric(t))} keyboardType="decimal-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>

            <Text style={styles.fieldLabel}>Duration</Text>
            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Hours" placeholderTextColor={C.textSecondary}
                value={cashHours} onChangeText={t => setCashHours(sanitizeNumeric(t))} keyboardType="number-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Minutes" placeholderTextColor={C.textSecondary}
                value={cashMinutes} onChangeText={t => setCashMinutes(sanitizeNumeric(t))} keyboardType="number-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>

            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable style={styles.dateField} onPress={() => setDatePickerFor('cash')}>
              <Text style={styles.dateFieldText}>{formatDateReadable(cashDate)}</Text>
            </Pressable>

            <TextInput style={styles.formInput} placeholder="Notes (optional)" placeholderTextColor={C.textSecondary}
              value={cashNotes} onChangeText={setCashNotes} multiline />

            <Text style={[styles.livePreview, cashLiveResult < 0 && styles.negative]}>
              Result: {cashLiveResult >= 0 ? '+' : '-'}{formatMoney(Math.abs(cashLiveResult), currency)}
            </Text>

            <Pressable
              onPress={submitCashSession}
              style={({ pressed }) => [styles.sheetBtn, pressed && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Session</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
          <DatePickerModal
            visible={datePickerFor === 'cash'}
            value={cashDate}
            onClose={() => setDatePickerFor(null)}
            onSelect={setCashDate}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Bottom sheet: tournament */}
      <Modal
        visible={addSheet === 'tournament'}
        transparent
        animationType="slide"
        onRequestClose={handleSheetBackdropPress}>
        <Pressable style={styles.modalOverlay} onPress={handleSheetBackdropPress} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Tournament</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.formInput} placeholder="e.g. WSOP Main Event" placeholderTextColor={C.textSecondary}
              value={tourneyLocation} onChangeText={setTourneyLocation}
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            <SavedLocationChips
              locations={savedLocations}
              query={tourneyLocation}
              onSelect={setTourneyLocation}
              onRemove={removeSavedLocation}
            />

            <Text style={styles.fieldLabel}>Buy-in</Text>
            <TextInput style={styles.formInput} placeholder={`Buy-in ${symbol}`} placeholderTextColor={C.textSecondary}
              value={tourneyBuyIn} onChangeText={t => setTourneyBuyIn(sanitizeNumeric(t))} keyboardType="decimal-pad"
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Finish position" placeholderTextColor={C.textSecondary}
                value={tourneyFinish} onChangeText={t => setTourneyFinish(sanitizeNumeric(t))} keyboardType="number-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder={`Prize won ${symbol} (0 if none)`} placeholderTextColor={C.textSecondary}
                value={tourneyPrize} onChangeText={t => setTourneyPrize(sanitizeNumeric(t))} keyboardType="decimal-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>

            <TextInput style={styles.formInput} placeholder="Total entrants (optional)" placeholderTextColor={C.textSecondary}
              value={tourneyEntrants} onChangeText={t => setTourneyEntrants(sanitizeNumeric(t))} keyboardType="number-pad"
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Text style={styles.fieldLabel}>Duration</Text>
            <View style={styles.formRow}>
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Hours" placeholderTextColor={C.textSecondary}
                value={tourneyHours} onChangeText={t => setTourneyHours(sanitizeNumeric(t))} keyboardType="number-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
              <TextInput style={[styles.formInput, styles.formInputHalf]} placeholder="Minutes" placeholderTextColor={C.textSecondary}
                value={tourneyMinutes} onChangeText={t => setTourneyMinutes(sanitizeNumeric(t))} keyboardType="number-pad"
                returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />
            </View>

            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable style={styles.dateField} onPress={() => setDatePickerFor('tournament')}>
              <Text style={styles.dateFieldText}>{formatDateReadable(tourneyDate)}</Text>
            </Pressable>

            <TextInput style={styles.formInput} placeholder="Notes (optional)" placeholderTextColor={C.textSecondary}
              value={tourneyNotes} onChangeText={setTourneyNotes} multiline />

            <Text style={[styles.livePreview, tourneyLiveResult < 0 && styles.negative]}>
              Result: {tourneyLiveResult >= 0 ? '+' : '-'}{formatMoney(Math.abs(tourneyLiveResult), currency)}
            </Text>

            <Pressable
              onPress={submitTournament}
              style={({ pressed }) => [styles.sheetBtn, pressed && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Tournament</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
          <DatePickerModal
            visible={datePickerFor === 'tournament'}
            value={tourneyDate}
            onClose={() => setDatePickerFor(null)}
            onSelect={setTourneyDate}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Bottom sheet: deposit */}
      <Modal
        visible={addSheet === 'deposit'}
        transparent
        animationType="slide"
        onRequestClose={handleSheetBackdropPress}>
        <Pressable style={styles.modalOverlay} onPress={handleSheetBackdropPress} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Deposit</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput style={styles.formInput} placeholder={`Amount ${symbol}`} placeholderTextColor={C.textSecondary}
              value={cashFlowAmount} onChangeText={t => setCashFlowAmount(sanitizeNumeric(t))} keyboardType="decimal-pad"
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable style={styles.dateField} onPress={() => setDatePickerFor('deposit')}>
              <Text style={styles.dateFieldText}>{formatDateReadable(cashFlowDate)}</Text>
            </Pressable>

            <TextInput style={styles.formInput} placeholder="Notes (optional)" placeholderTextColor={C.textSecondary}
              value={cashFlowNotes} onChangeText={setCashFlowNotes} multiline />

            {canSaveCashFlow && (
              <Text style={styles.livePreview}>
                New total: {formatMoney(cashFlowPreviewTotal, currency)}
              </Text>
            )}

            <Pressable
              onPress={submitCashFlow}
              disabled={!canSaveCashFlow}
              style={({ pressed }) => [styles.sheetBtn, (pressed || !canSaveCashFlow) && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Deposit</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
          <DatePickerModal
            visible={datePickerFor === 'deposit'}
            value={cashFlowDate}
            onClose={() => setDatePickerFor(null)}
            onSelect={setCashFlowDate}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Bottom sheet: withdrawal */}
      <Modal
        visible={addSheet === 'withdrawal'}
        transparent
        animationType="slide"
        onRequestClose={handleSheetBackdropPress}>
        <Pressable style={styles.modalOverlay} onPress={handleSheetBackdropPress} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Withdrawal</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput style={styles.formInput} placeholder={`Amount ${symbol}`} placeholderTextColor={C.textSecondary}
              value={cashFlowAmount} onChangeText={t => setCashFlowAmount(sanitizeNumeric(t))} keyboardType="decimal-pad"
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Text style={styles.fieldLabel}>Date</Text>
            <Pressable style={styles.dateField} onPress={() => setDatePickerFor('withdrawal')}>
              <Text style={styles.dateFieldText}>{formatDateReadable(cashFlowDate)}</Text>
            </Pressable>

            <TextInput style={styles.formInput} placeholder="Notes (optional)" placeholderTextColor={C.textSecondary}
              value={cashFlowNotes} onChangeText={setCashFlowNotes} multiline />

            {canSaveCashFlow && (
              <Text style={styles.livePreview}>
                New total: {formatMoney(cashFlowPreviewTotal, currency)}
              </Text>
            )}

            <Pressable
              onPress={submitCashFlow}
              disabled={!canSaveCashFlow}
              style={({ pressed }) => [styles.sheetBtn, (pressed || !canSaveCashFlow) && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Withdrawal</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
          <DatePickerModal
            visible={datePickerFor === 'withdrawal'}
            value={cashFlowDate}
            onClose={() => setDatePickerFor(null)}
            onSelect={setCashFlowDate}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Bottom sheet: other expense */}
      <Modal
        visible={addSheet === 'expense'}
        transparent
        animationType="slide"
        onRequestClose={closeAll}>
        <Pressable style={styles.modalOverlay} onPress={closeAll} />
        <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Other Expense</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={styles.formInput} placeholder="e.g. Dinner with the group" placeholderTextColor={C.textSecondary}
              value={expenseDescription} onChangeText={setExpenseDescription}
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Text style={styles.fieldLabel}>Amount</Text>
            <TextInput style={styles.formInput} placeholder={`Amount ${symbol}`} placeholderTextColor={C.textSecondary}
              value={expenseAmount} onChangeText={t => setExpenseAmount(sanitizeNumeric(t))} keyboardType="decimal-pad"
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.pickerRow}>
              {EXPENSE_CATEGORIES.map(c => (
                <Pressable
                  key={c.key}
                  onPress={() => setExpenseCategory(c.key)}
                  style={[styles.pickerPill, expenseCategory === c.key && styles.pickerPillActive]}>
                  <Text style={[styles.pickerPillText, expenseCategory === c.key && styles.pickerPillTextActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Date</Text>
            <TextInput style={styles.formInput} placeholder="YYYY-MM-DD" placeholderTextColor={C.textSecondary}
              value={expenseDate} onChangeText={setExpenseDate}
              returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} />

            <Pressable
              onPress={submitExpense}
              style={({ pressed }) => [styles.sheetBtn, pressed && styles.dimmed]}>
              <Text style={styles.sheetBtnText}>Save Expense</Text>
            </Pressable>
            <View style={{ height: BottomTabInset + Spacing.two }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Total bankroll edit — centered modal, keyboard-safe */}
      <Modal
        visible={showTotalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTotalModal(false)}>
        <View style={styles.totalModalWrap}>
          <Pressable style={[StyleSheet.absoluteFill, styles.modalOverlay]} onPress={() => setShowTotalModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.totalCard}>
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, styles.noMargin]}>Total Bankroll</Text>
              <Pressable onPress={() => Keyboard.dismiss()} hitSlop={8}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>

            <Text style={styles.sheetSub}>What's your bankroll worth right now?</Text>

            <TextInput
              style={styles.formInput}
              placeholder={`Amount (${symbol})`}
              placeholderTextColor={C.textSecondary}
              value={totalInput}
              onChangeText={t => setTotalInput(sanitizeNumeric(t))}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
              autoFocus
            />

            <View style={styles.totalActions}>
              <Pressable
                onPress={() => setShowTotalModal(false)}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.dimmed]}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveTotalBankroll}
                disabled={!canSaveTotal}
                style={({ pressed }) => [styles.sheetBtn, styles.saveBtnFlex, (pressed || !canSaveTotal) && styles.dimmed]}>
                <Text style={styles.sheetBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three + WebTopClearance },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
  },
  addHeaderBtn: {
    borderWidth: 1.5,
    borderColor: C.tint,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addHeaderBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },

  // Bankroll card
  bankrollCard: {
    backgroundColor: C.tint,
    borderRadius: 20,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  bankrollLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.65)',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bankrollAmount: {
    fontSize: 52,
    fontWeight: '800',
    color: C.tintText,
    letterSpacing: -1.5,
    marginBottom: 12,
  },
  bankrollChangePill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  bankrollChangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(212,237,218,0.9)',
  },

  // Stats — cash | tournament
  statsSection: {
    flexDirection: 'row',
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    marginBottom: Spacing.three,
  },
  statsColumn: {
    flex: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  statsColumnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },
  statsDivider: {
    width: 1,
    backgroundColor: C.backgroundSelected,
    marginVertical: Spacing.three,
  },
  miniStat: {
    marginBottom: Spacing.two,
  },
  miniStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 2,
  },
  miniStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
  },

  // Recent sessions
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },
  sessionList: { gap: Spacing.two },
  sessionCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionLeft: { flex: 1, marginRight: Spacing.two },
  sessionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 3,
  },
  sessionLocation: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text,
    flexShrink: 1,
  },
  sessionTypeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sessionMeta: { fontSize: 13, color: C.textSecondary },
  sessionResult: { fontSize: 17, fontWeight: '700' },
  resultWin:  { color: C.tint },
  resultLoss: { color: C.negative },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: Spacing.three,
  },
  emptyIcon: { fontSize: 56, color: C.tint, marginBottom: Spacing.two },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center' },

  // Modal / bottom sheet
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: C.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxHeight: '85%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: C.backgroundSelected,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: Spacing.three,
  },
  sheetSub: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: Spacing.two,
    marginTop: -8,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  noMargin: { marginBottom: 0 },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.tint,
  },
  sheetBtn: {
    backgroundColor: C.tint,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  sheetBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.tintText,
  },

  // Option cards (Add Transaction picker)
  optionCardList: { gap: Spacing.two },
  optionCard: {
    backgroundColor: C.backgroundElement,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: Spacing.three,
  },
  optionCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  optionCardDesc: {
    fontSize: 13,
    color: C.textSecondary,
  },

  // Form
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textSecondary,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
    marginBottom: Spacing.two,
  },
  formRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formInputHalf: {
    flex: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.two,
  },
  pickerPill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.backgroundElement,
  },
  pickerPillActive: {
    backgroundColor: C.tint,
  },
  pickerPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textSecondary,
  },
  pickerPillTextActive: {
    color: C.tintText,
  },
  livePreview: {
    fontSize: 15,
    fontWeight: '700',
    color: C.tint,
    marginBottom: Spacing.two,
  },
  negative: { color: C.negative },

  dateField: {
    backgroundColor: C.backgroundElement,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: Spacing.two,
  },
  dateFieldText: {
    fontSize: 16,
    color: C.text,
  },

  // Saved location chips
  locationChipsSection: {
    marginTop: -6,
    marginBottom: Spacing.two,
  },
  locationChipsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  locationChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
    borderRadius: 20,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  locationChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  locationChipDelete: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  locationChipDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textSecondary,
  },

  // Total bankroll editor — centered, keyboard-safe modal
  totalModalWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalCard: {
    width: '86%',
    backgroundColor: C.background,
    borderRadius: 20,
    padding: Spacing.four,
  },
  totalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: C.backgroundElement,
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.text,
  },
  saveBtnFlex: {
    flex: 1,
    marginTop: 0,
  },

  dimmed: { opacity: 0.7 },
});

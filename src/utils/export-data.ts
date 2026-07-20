import { HandRecord } from '@/components/hand-review/types';
import { BankrollTransaction } from '@/utils/bankroll-storage';
import { CurrencyCode, formatMoney } from '@/utils/currency';
import { txResult } from '@/utils/stats';

export function buildExportSummary(
  hands: HandRecord[],
  bankroll: BankrollTransaction[],
  startingBankroll: number,
  currentBankroll: number,
  currency: CurrencyCode
): string {
  const lines: string[] = [];
  lines.push('Poker Study — Data Export');
  lines.push(`Generated ${new Date().toLocaleString()}`);
  lines.push('');

  lines.push(`BANKROLL (${hands.length} hands, ${bankroll.length} transactions)`);
  lines.push(`Starting bankroll: ${formatMoney(startingBankroll, currency)}`);
  lines.push(`Current bankroll: ${formatMoney(currentBankroll, currency)}`);
  lines.push('');

  const sessions = bankroll.filter(t => t.type === 'session');
  lines.push(`SESSIONS (${sessions.length})`);
  for (const tx of sessions) {
    const result = txResult(tx);
    const sign = result >= 0 ? '+' : '-';
    const date = new Date(tx.createdAt).toLocaleDateString();
    if (tx.gameType === 'tournament') {
      lines.push(
        `${date} — Tournament — ${tx.location ?? 'Unknown'} — Buy-in ${formatMoney(tx.buyIn ?? 0, currency)} — Result ${sign}${formatMoney(Math.abs(result), currency)}`
      );
    } else {
      lines.push(
        `${date} — Cash — ${tx.location ?? 'Unknown'} (${tx.stakes ?? ''}) — Result ${sign}${formatMoney(Math.abs(result), currency)}`
      );
    }
  }
  lines.push('');

  const otherTx = bankroll.filter(t => t.type !== 'session');
  if (otherTx.length > 0) {
    lines.push(`OTHER TRANSACTIONS (${otherTx.length})`);
    for (const tx of otherTx) {
      const date = new Date(tx.createdAt).toLocaleDateString();
      lines.push(`${date} — ${tx.type} — ${formatMoney(tx.amount ?? 0, currency)}${tx.notes ? ` — ${tx.notes}` : ''}`);
    }
    lines.push('');
  }

  lines.push(`HANDS (${hands.length})`);
  for (const h of hands) {
    const date = new Date(h.createdAt).toLocaleDateString();
    lines.push(`${date} — ${h.displayPositions} — ${h.displayHoleCards} — ${h.displayPotType}, ${h.displayStreet} — Status: ${h.status}${h.flagged ? ' [flagged]' : ''}`);
  }

  return lines.join('\n');
}

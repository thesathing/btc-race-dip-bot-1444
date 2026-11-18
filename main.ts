// Fast dip scalper for make.fun btc-race-24h-20261118-1444 (v2).
//
// Round 1 of this entry bought two big dips and waited for +100 bps; it
// made +$16.83 on the dev window but only traded twice in 24 hours. This
// version trades the way the window actually moves: short dips that
// bounce within the hour, bought in $400 slices, sold quickly.
//
// - Entry: the 15-minute close-to-close return is at or below -30 bps
//   AND the latest close ticks up from the previous one (a reversal
//   tick, so the bot does not buy into the middle of a falling knife).
//   On the dev window a 15-minute dip of -30 bps or worse recovers
//   +50 bps within 30 minutes about 9 times in 10.
// - Size: $400 per buy. If the price falls another 60 bps under the
//   average entry, add another $400, up to 2 adds, so a genuinely deep
//   dip is bought big (up to the $1,000 of paper money) instead of once
//   and small. Each add restarts the hold clock and the peak.
// - Exit: +60 bps take profit from the average entry price, or an
//   80 bps trailing stop from the peak close since the last fill, after
//   a 3-bar minimum hold. A 60 bps target clears the round-trip cost
//   (about 22 bps on a $400 trade: 4 bps fee + 2 bps slippage + pool
//   impact, each side) with room to spare; wider targets (+100 bps)
//   give back most of the gain on this window, tighter ones (+40 bps)
//   lose money outright.
// - Fallback: if nothing has traded by bar 720, buy $400 anyway with
//   the same exits, so a dip-less rising window still leaves at least
//   one trade (the race requires >= 1 trade and max drawdown <= 25%).
// - No new entries from bar 1380, so no fresh exposure is carried into
//   the close; an open position keeps its exits.
//
// Local grade on the published dev window (kit grade-local, process
// driver): net PnL +$14.22, 18 trades, win rate 0.71, max drawdown
// 0.81%, exposure 0.40. Slightly below round 1's +$16.83, but from
// 18 trades instead of 4, so the result does not rest on two moves.
//
// Protocol: agent-fun/bars-replay/v1, one JSON line per batch on stdin,
// one reply per batch on stdout (see vendor/makefun-bars.ts, the kit's
// TypeScript shim, copied byte-identical). Deterministic: no clock, no
// environment, no randomness, no network, no files outside the
// repository. Signal math is plain float64 arithmetic in a fixed order;
// money is bigints from the harness state.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// A dip is measured over this many minutes, and must be at least this deep.
const DIP_WINDOW = 15;
const DIP_THRESHOLD_BPS = 30;

// $400 per buy, in micro-USDC; a further fall of this much under the
// average entry buys another slice, at most this many times.
const BUY_SIZE_MICRO = 400_000_000;
const ADD_DIP_BPS = 60;
const MAX_ADDS = 2;

// Exits, in basis points: take profit from the average entry, trailing
// stop from the peak close since the last fill.
const TAKE_PROFIT_BPS = 60;
const TRAILING_BPS = 80;
const MIN_HOLD_BARS = 3;

// Fallback buy if the dip never comes; last bar that may open a trade.
const FALLBACK_BAR = 720;
const LAST_ENTRY_BAR = 1380;

// Slippage cap on every order: 1-minute moves peak near 45 bps on the
// dev window, so 150 bps never binds in normal trading but refuses a
// fill across a gap instead of chasing it.
const MAX_SLIPPAGE_BPS = 150;

const closes: number[] = [];
let avgEntry: number | null = null;
let filledSeq = -1;
let peakClose = 0;
let buyCount = 0;
let hasTraded = false;
let lastQty = 0n;

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    let close: number | null = null;
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) close = Number(bar.c) / 100000;
    }
    if (close === null) return [];
    closes.push(close);
    if (state.warmingUp) return [];

    const position = state.positions.get(SYMBOL);
    if (position !== undefined) {
      // A position only counts as traded once its fill actually lands:
      // an order the market rejects must not disable the fallback buy.
      hasTraded = true;
      const qty = position.qty;
      if (avgEntry === null || qty > lastQty) {
        // A new fill landed (first buy or an add): the average entry
        // comes from the position's cost, and the peak and the hold
        // clock restart at this batch's close.
        avgEntry = (Number(position.cost) * 100) / Number(qty);
        filledSeq = state.seq;
        peakClose = close;
        buyCount += 1;
      }
      lastQty = qty;
      if (close > peakClose) peakClose = close;
      if (avgEntry !== null && state.seq - filledSeq >= MIN_HOLD_BARS) {
        const trailingHit = close <= peakClose * (1 - TRAILING_BPS / 10000);
        const profitHit = close >= avgEntry * (1 + TAKE_PROFIT_BPS / 10000);
        if (trailingHit || profitHit) {
          lastQty = 0n;
          return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      // Averaging down: the price fell another slice under the average
      // entry, so buy another $400 while there is cash and adds left.
      if (avgEntry !== null && buyCount <= MAX_ADDS && state.seq < LAST_ENTRY_BAR
        && close <= avgEntry * (1 - ADD_DIP_BPS / 10000)) {
        const cash = state.cash;
        const amount = cash < BigInt(BUY_SIZE_MICRO) ? cash : BigInt(BUY_SIZE_MICRO);
        if (amount >= BigInt(state.hello.fees.min_notional_quote_units)) {
          return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Flat: reset entry tracking.
    avgEntry = null;
    filledSeq = -1;
    peakClose = 0;
    buyCount = 0;
    lastQty = 0n;

    if (state.seq >= LAST_ENTRY_BAR) return [];

    const n = closes.length;
    const dipped = n > DIP_WINDOW
      && closes[n - 1] / closes[n - 1 - DIP_WINDOW] - 1 <= -DIP_THRESHOLD_BPS / 10000;
    const uptick = n >= 2 && closes[n - 1] > closes[n - 2];
    const fallback = !hasTraded && state.seq >= FALLBACK_BAR;
    if ((dipped && uptick) || fallback) {
      const cash = state.cash;
      const amount = cash < BigInt(BUY_SIZE_MICRO) ? cash : BigInt(BUY_SIZE_MICRO);
      if (amount >= BigInt(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: amount, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});

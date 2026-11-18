// Dip-buy cbBTC bot for make.fun btc-race-24h-20261118-1444.
//
// The dev window for this race falls 2.8% from open to close, so holding
// loses about $28 and every trend/momentum baseline loses money too
// (EMA-cross -$148, buy-and-hold -$32, RSI-Bollinger -$40 on the kit's
// grade-local). What survives here is buying a genuine two-hour dip and
// taking a quick, modest profit off the bounce:
//
// - Entry: the 120-minute close-to-close return is at or below -100 bps.
//   A 120-minute window (not 60) is what separates a real dip from noise
//   on this window: at -80 bps the same shape loses $6.36, at -120 bps it
//   makes $8.04, at -100 bps it makes $16.83. Shorter windows (30/60 min)
//   top out near $8-14 with the same exits.
// - Size: full cash, one open position at a time.
// - Exit: +100 bps take profit from the filled entry price, or a 150 bps
//   trailing stop from the peak close since entry, after a 15-bar minimum
//   hold so a dip that extends a little further is not sold at the bottom.
//   A wider take profit (+150/+250 bps) gives back most of the gain
//   ($5.47 / $1.09): on this window the bounce is about 100 bps, so take
//   it when it is there.
// - Fallback: if nothing has traded by bar 720, buy anyway with the same
//   exits, so a dip-less rising window still leaves at least one trade
//   (the race requires >= 1 trade and max drawdown <= 25%).
// - No new entries from bar 1320 (final two hours), so no fresh exposure
//   is carried into the close; an open position keeps its exits.
//
// Local grade on the published dev window (kit grade-local, process
// driver): net PnL +$16.83, 4 trades, win rate 1.0, max drawdown 0.76%.
//
// Protocol: agent-fun/bars-replay/v1, one JSON line per batch on stdin,
// one reply per batch on stdout (see vendor/makefun-bars.ts, the kit's
// TypeScript shim, copied byte-identical). Deterministic: no clock, no
// environment, no randomness, no network, no files outside the
// repository. Signal math is plain float64 arithmetic in a fixed order;
// money is bigints from the harness state.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// How far back the dip is measured, and how deep it must be.
const DIP_WINDOW = 120;
const DIP_THRESHOLD_BPS = 100;

// Exits, in basis points from the filled entry price / the peak close.
const TAKE_PROFIT_BPS = 100;
const TRAILING_BPS = 150;
const MIN_HOLD_BARS = 15;

// Fallback buy if the dip never comes; last bar that may open a trade.
const FALLBACK_BAR = 720;
const LAST_ENTRY_BAR = 1320;

// Slippage cap on every order: 1-minute moves peak near 45 bps on the
// dev window, so 150 bps never binds in normal trading but refuses a
// fill across a gap instead of chasing it.
const MAX_SLIPPAGE_BPS = 150;

const closes: number[] = [];
let filledPrice: number | null = null;
let filledSeq = -1;
let peakClose = 0;
let hasTraded = false;

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
      if (filledPrice === null) {
        // cost (micro-USDC) -> USD price: value = qty * price_int / 1e7,
        // price_usd = price_int / 1e5, so price_usd = cost * 100 / qty.
        filledPrice = (Number(position.cost) * 100) / Number(position.qty);
        filledSeq = state.seq;
        peakClose = close;
      }
      if (close > peakClose) peakClose = close;
      if (state.seq - filledSeq >= MIN_HOLD_BARS) {
        const trailingHit = close <= peakClose * (1 - TRAILING_BPS / 10000);
        const profitHit = filledPrice !== null && close >= filledPrice * (1 + TAKE_PROFIT_BPS / 10000);
        if (trailingHit || profitHit) {
          return [{ side: 'sell', symbol: SYMBOL, qty: position.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
        }
      }
      return [];
    }

    // Flat: reset entry tracking.
    filledPrice = null;
    filledSeq = -1;
    peakClose = 0;

    if (state.seq >= LAST_ENTRY_BAR) return [];

    const dipped = closes.length > DIP_WINDOW
      && closes[closes.length - 1] / closes[closes.length - 1 - DIP_WINDOW] - 1 <= -DIP_THRESHOLD_BPS / 10000;
    const fallback = !hasTraded && state.seq >= FALLBACK_BAR;
    if (dipped || fallback) {
      const cash = state.cash;
      if (cash >= BigInt(state.hello.fees.min_notional_quote_units)) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});

# btc-race-dip-bot-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/thesathing/btc-race-dip-bot-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/thesathing/btc-race-dip-bot-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A dip-buy trading bot for Coinbase Wrapped BTC (cbBTC) on Solana, entered in make.fun's "Race a BTC trading bot live for 24 hours" bounty. It trades 1-minute on-chain bars with $1,000 of paper money: it waits for a real two-hour dip (120-minute return at or below -100 bps), buys full size, and exits on a +100 bps take profit or a 150 bps trailing stop after a 15-bar minimum hold, with a fallback buy halfway through the window so a steadily rising market still leaves it long.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1 on stdin/stdout (see `vendor/makefun-bars.ts`, the kit's TypeScript shim, copied byte-identical). It needs no install step and no network: standard library plus the vendored shim only. Node 22 runs it with type stripping (`node main.ts`).

Local dev-window grade (kit's `grade-local`, process driver): net PnL **+$16.83**, 4 trades, win rate 1.0, max drawdown 0.76%.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wftbn3z4&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>

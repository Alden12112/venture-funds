# AD88 read-only MT5 market bridge

This bridge is for reference prices only. It can make AD88 display the same
Bid/Ask/Last quote that an authorized MT5 terminal receives from its broker.
It does not accept a MetaTrader login, password, account number, withdrawal
instruction or trade command. AD88 remains a paper-trading workspace.

## Architecture

```text
MT5 terminal
  → AD88MarketBridge.mq5 (your terminal)
  → HTTPS POST https://ad88-platform.onrender.com/api/mt5/ticks
  → AD88 normalized quote cache + SSE
  → Trade workspace
```

The browser never sees the ingest secret. The MT5 terminal keeps it locally in
the EA input parameters and sends it only as an HTTPS request header.

## Configure Render

1. Open the `ad88-platform` Render service, not the standalone `ad88-admin` service.
2. Create a private environment variable named `MT5_INGEST_SECRET`.
3. Set a long, randomly generated value. Do not reuse `AUTH_SECRET`, an admin
   password, an API key, or any broker credential.
4. Save the variable and let Render redeploy the frontend service.

When the secret is absent, AD88 safely refuses MT5 ticks and continues with its
standard public market providers.

## Install the EA

1. Copy [`../mt5/AD88MarketBridge.mq5`](../mt5/AD88MarketBridge.mq5) to the MT5
   `MQL5/Experts` directory and compile it in MetaEditor.
2. In MT5, add `https://ad88-platform.onrender.com` to
   **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**.
3. Attach the EA to any chart. It uses a one-second timer and reads the chosen
   symbols from Market Watch; it never opens, changes, or closes orders.
4. Set `IngestUrl` to
   `https://ad88-platform.onrender.com/api/mt5/ticks`.
5. Set `IngestKey` to the exact value of `MT5_INGEST_SECRET`.
6. Use your broker's Market Watch symbols in `Instruments`. The bridge accepts
   common suffixes such as `XAUUSDm` and `EURUSD.pro`.

## Supported normalizations

| MT5 symbol | AD88 symbol |
| --- | --- |
| `XAUUSD`, `GOLD` | `XAU` |
| `XAGUSD`, `SILVER` | `XAG` |
| `BTCUSD`, `BTCUSDT` | `BTC` |
| `ETHUSD`, `ETHUSDT` | `ETH` |
| `USOIL`, `WTI`, `XTIUSD` | `CL` |
| `UKOIL`, `BRENT`, `XBRUSD` | `BRN` |
| `NATGAS`, `NATURALGAS` | `NG` |
| `COPPER`, `XCUUSD` | `HG` |
| `EURUSD`, `GBPUSD`, `USDJPY`, `AUDUSD`, `USDCAD` | matching AD88 FX symbol |

The bridge accepts a maximum of 64 normal, current ticks per request. A quote
expires from broker-feed status after 20 seconds; AD88 then transparently
returns to its normal live API / cached / fallback data state.

## Test without exposing credentials

From a secure machine, use a temporary test secret and send a request like:

```json
{
  "broker": "Demo reference terminal",
  "environment": "demo",
  "ticks": [
    { "symbol": "XAUUSD", "bid": 0, "ask": 0, "last": 0, "time": 0 }
  ]
}
```

Replace the zero values only in your private test. Do not commit actual prices,
broker credentials, or the secret to a repository, ticket, screenshot, or
chat. A successful response lists only accepted AD88 symbols.

## Boundaries

- This is a read-only market-data bridge, not MT5 order routing.
- Exact parity is only expected for instruments actually being delivered by the
  connected broker terminal. Other assets continue to use AD88 public data.
- For high availability across multiple web instances, use a managed stream
  transport such as Redis before scaling the Render frontend horizontally.

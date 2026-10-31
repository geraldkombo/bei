# bei

**Uliza bei kabla ya kulipa.** Ask the price before you pay.

Crowdsourced prices and fares on USSD + SMS for Kenya — built for the festive season, political season, and every Tuesday in between. No app, no internet, no registration: dial, ask, pay fair.

## Why

- **December**: upcountry bus fares double overnight. A Nairobi–Mombasa ticket goes from KES 2,000 to 4,500 and nobody knows the real price until they are at the stage.
- **Everyday**: matatu fares change with fuel, weather and mood. Market prices vary stall to stall.
- **Visitors**: tourists get quoted 10x at JKIA and have no way to check.
- **Election season**: rallies move crowds — transport, food and water prices spike around events. Same tool, same question: bei gani?

The answer is the same everywhere: ask the person who paid this morning. **bei** turns every paying customer into a price reporter, and rewards them with airtime.

## What it does

USSD menu (works on any phone):

1. **Matatu fares** — CBD–Kibera, JKIA–CBD, and more
2. **Festive travel** — upcountry bus routes with Dec–Jan surge ranges
3. **Food & market prices** — tomatoes, unga, oil, beef...
4. **Forex** — USD/EUR/GBP to KES for visitors
5. **Tourist corner** — emergency numbers (999/112/1199), airport fare guidance, bargaining Swahili
6. **Report a price** — crowdsourced entries; every 10 reports = **KES 5 airtime** (Africa's Talking Airtime API)
7. **Price alerts** — subscribe to an item, get an SMS the moment a new price is reported
8. **My points** — reporter record and airtime earned

Every query blends seed ranges with the live crowd median (3+ reports in 7 days). Web dashboard shows the full book, recent reports and the reporter leaderboard.

## Run it

```bash
npm install
npm start          # http://localhost:3000 (dashboard)
npm test           # full USSD conversation smoke tests
```

Without API keys everything works: SMS/Airtime log to console (dry-run). Add `AT_USERNAME` + `AT_API_KEY` (see `.env.example`) to go live on Africa's Talking.

## USSD callback

Point your Africa's Talking shortcode callback to `POST /ussd`.

```
curl -d "sessionId=demo&phoneNumber=+254712345678&serviceCode=*384*23#&text=" http://localhost:3000/ussd
```

## Endpoints

| Route | Purpose |
|---|---|
| `POST /ussd` | Africa's Talking USSD callback |
| `GET /api/summary` | All categories/items + crowd stats (dashboard) |
| `GET /api/reports` | Recent reports + leaderboard |
| `POST /api/report` | `{phone, itemId, amount}` — record a price |

## Tech

Node 24 (built-in `node:sqlite` — no external database), Express, `africastalking` SDK (SMS + Airtime). Uses **3 AT products: USSD, SMS, Airtime**.

## Docker

```bash
docker build -t bei:1.0.0 .
docker run -p 3000:3000 -v bei-data:/data -e AT_USERNAME=... -e AT_API_KEY=... bei:1.0.0
```

Configuration:

- Env vars: `AT_USERNAME`, `AT_API_KEY`, `BEI_REWARD_EVERY`, `PORT`, `BEI_DB`
- Database: none required (embedded SQLite on the `/data` volume)
- Multi-instance: one deploy per town, SACCO, market association or tour operator — each instance seeds its own routes and items

## Roadmap

- Voice: call to hear today's fares (low-literacy + driving users)
- Premium SMS short code: text `BEI MOMBASA` to 12345
- Political-season mode: rally-day transport & vendor prices by county
- County seed packs: matatu routes for Mombasa, Kisumu, Nakuru, Eldoret

## License

MIT

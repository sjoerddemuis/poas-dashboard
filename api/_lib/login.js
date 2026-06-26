# POAS-dashboard — web-app (Vercel + Metorik + login)

Een beveiligde, live web-app van het blended-POAS-dashboard. Haalt de cijfers
rechtstreeks uit Metorik (server-side, je API-sleutels blijven geheim), met een
simpele login waar **alleen jij als admin mensen uitnodigt** — niemand kan zelf
een account aanmaken.

Tabs: **NL · DE · FR · Totaal**. Alles ex btw. AOV per land dynamisch (laatste 30 dagen).

---

## Wat zit erin

```
poas-app/
├─ public/
│  ├─ index.html      ← het dashboard (achter login)
│  └─ login.html      ← inlogpagina
├─ api/
│  ├─ login.js        ← inloggen (zet sessie-cookie)
│  ├─ logout.js
│  ├─ me.js           ← wie ben ik / sessiecheck
│  ├─ data.js         ← live Metorik-data (beveiligd, 30 min cache)
│  ├─ admin/users.js  ← gebruikers uitnodigen/verwijderen (alleen admin)
│  └─ _lib/           ← auth, opslag, Metorik-helpers
├─ package.json
├─ vercel.json
└─ .env.example       ← overzicht van alle benodigde sleutels
```

---

## Deploy in 5 stappen

### 1. Zet de code op GitHub
- Maak een nieuwe (private) repository, bijv. `poas-dashboard`.
- Upload de **inhoud van de map `poas-app`** naar de repo (sleep de bestanden in GitHub's "upload files", of via GitHub Desktop). Commit `node_modules` niet (de `.gitignore` regelt dat al).

### 2. Maak Metorik API-tokens (1 per shop)
In **elke** store (NL, DE, FR): Metorik → **Store Settings → API Keys → Create**.
- Naam: bijv. `POAS dashboard`.
- Scope: **Reports & Data** (read-only).
- Kopieer de drie tokens; je hebt ze zo nodig.

### 3. Koppel de repo aan Vercel
- Ga naar [vercel.com](https://vercel.com), log in met GitHub.
- **Add New → Project → Import** je repo. Framework: **Other** (laat de rest leeg). Nog niet deployen — eerst stap 4.

### 4. Zet de Environment Variables (Vercel → Project → Settings → Environment Variables)
| Naam | Waarde |
|---|---|
| `JWT_SECRET` | een lange willekeurige string (bijv. 40 tekens) |
| `ADMIN_EMAIL` | jouw e-mail (de admin-login) |
| `ADMIN_PASSWORD` | een sterk admin-wachtwoord |
| `METORIK_TOKEN_NL` | token van de NL-store |
| `METORIK_TOKEN_DE` | token van de DE-store |
| `METORIK_TOKEN_FR` | token van de FR-store |

**Gebruikersopslag (voor uitgenodigde mensen):** ga in Vercel naar de **Storage**-tab
→ **Upstash (Redis)** → Create (gratis tier). Koppel 'm aan dit project; Vercel zet
dan automatisch `KV_REST_API_URL` en `KV_REST_API_TOKEN` als env vars. (Zonder dit
werkt alleen de admin-login.)

### 5. Deploy
- Klik **Deploy**. Na ~1 minuut krijg je een URL, bijv. `https://poas-dashboard.vercel.app`.
- Open 'm → je komt op de inlogpagina → log in met je `ADMIN_EMAIL` + `ADMIN_PASSWORD`.

---

## Mensen uitnodigen
- Log in als admin → knop **Gebruikers** (rechtsboven).
- Vul e-mail + wachtwoord in → **Toevoegen**. Stuur die persoon de link + inloggegevens.
- Verwijderen kan met het ✕'je. Zij kunnen zelf niets aanmaken of wijzigen.

## De link delen
Deel gewoon de Vercel-URL. Iedereen die je hebt uitgenodigd kan inloggen en ziet
de live cijfers. Wil je een eigen domein (bijv. `poas.ongediertewinkel.nl`)? Dat
kan in Vercel → Settings → Domains.

## Data verversen
De app cachet Metorik-data 30 minuten. De knop **↻ Ververs** haalt opnieuw op
(na de cache-tijd). Niets handmatig bijwerken — het is altijd live.

## Lokaal draaien (optioneel, voor ontwikkelaars)
```
npm i -g vercel
vercel dev
```
Zet de env vars in een `.env`-bestand (zie `.env.example`).

## Veiligheid
- Metorik-tokens staan alleen server-side (in Vercel env vars), nooit in de browser.
- Wachtwoorden worden gehasht (scrypt) opgeslagen; sessies zijn HttpOnly-cookies (JWT).
- Zet altijd een eigen sterke `JWT_SECRET` en `ADMIN_PASSWORD`.

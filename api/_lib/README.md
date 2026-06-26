# Kopieer deze sleutels naar Vercel → Project → Settings → Environment Variables.
# (Niet dit bestand committen met echte waarden — .gitignore sluit .env al uit.)

# --- Login ---
JWT_SECRET=zet-hier-een-lange-willekeurige-string
ADMIN_EMAIL=jij@ongediertewinkel.nl
ADMIN_PASSWORD=kies-een-sterk-admin-wachtwoord

# --- Metorik API-tokens (1 per store, aanmaken in Metorik → Store Settings → API Keys, scope "Reports & Data") ---
METORIK_TOKEN_NL=
METORIK_TOKEN_DE=
METORIK_TOKEN_FR=

# --- Upstash Redis (voor uitgenodigde gebruikers) ---
# Worden automatisch gezet als je de Upstash-integratie in Vercel toevoegt.
# Anders handmatig invullen:
KV_REST_API_URL=
KV_REST_API_TOKEN=

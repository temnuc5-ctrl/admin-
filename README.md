# Portail de supervision — Douches de sécurité

Interface de supervision des contrôles de douches de sécurité : connexion
administrateur, rapports reçus, indicateurs de conformité et génération du
dashboard Excel.

## Démarrage

```bash
npm install
cp .env.example .env      # renseigner les variables
node scripts/hash-pin.mjs 123456   # → ADMIN_PIN_HASH
npm run dev
```

## Avant la première utilisation

Exécuter `supabase/SETUP.sql` dans **Supabase → SQL Editor**. Voir
`GUIDE_SUPABASE.md` (fourni à la racine de la livraison).

## Scripts

- `npm run dev` — portail + API en développement
- `npm run build` — build client + serveur
- `npm start` — serveur de production
- `npm run import:excel -- "fichier.xlsx"` — import de la feuille Détail (simulation)
- `npm run import:excel -- "fichier.xlsx" --apply` — écriture dans Supabase

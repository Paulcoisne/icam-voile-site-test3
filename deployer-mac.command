#!/bin/bash
cd "$(dirname "$0")"
echo "=== Publication du site Icam Voile Lille sur Netlify ==="
command -v node >/dev/null || { echo "Node.js n'est pas installé. Téléchargez-le sur https://nodejs.org puis relancez ce fichier."; read -p "Entrée pour fermer"; exit 1; }
npm install
npx --yes netlify-cli deploy --build --prod
read -p "Terminé. Entrée pour fermer"

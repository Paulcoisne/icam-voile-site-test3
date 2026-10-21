# Site Icam Voile Lille (Netlify)

## Contenu
- `public/index.html` : le site. `public/admin/` : l'administration (adresse : votre-site.netlify.app/admin).
- `public/assets/j80.mp4` + `public/assets/track.json` : vidéo du J80 et données de suivi 3D pré-calculées pour l'incrustation de logo.
- `netlify/functions/` : fonctions serveur (logo par nom de domaine, contenu, formulaire, administration, médias).

## Déploiement (obligatoire : avec les fonctions)
Le glisser-déposer sur Netlify Drop ne déploie pas les fonctions (admin, logo, formulaire). Sans GitHub :
1. Installez Node.js (version LTS) depuis https://nodejs.org.
2. Double-cliquez sur `deployer-windows.bat` (Windows) ou `deployer-mac.command` (Mac).
3. Au premier lancement, une page Netlify s'ouvre : autorisez l'accès, puis choisissez votre site existant dans la liste (« Link this directory to an existing project »).
4. Pour chaque mise à jour du code, relancez le même fichier. Les modifications faites dans /admin ne demandent aucun redéploiement.

Le stockage (équipe, budget, sponsors, demandes, photos) utilise Netlify Blobs : rien à configurer.

## Variables d'environnement (Netlify > Site configuration > Environment variables)
| Variable | Obligatoire | Rôle |
|---|---|---|
| `RESEND_API_KEY` | pour envoyer des e-mails | Clé du service d'e-mails Resend (offre gratuite). |
| `MAIL_FROM` | recommandé | Expéditeur, ex. `Icam Voile Lille <contact@votre-domaine.fr>`. Le domaine doit être vérifié dans Resend. |
| `ADMIN_PASSWORD_SHA256` | non | Pour changer le mot de passe admin : empreinte SHA-256 du nouveau mot de passe. |
| `ADMIN_SECRET` | non | Clé de signature des sessions (générée automatiquement sinon). |

Sans `RESEND_API_KEY`, les demandes du formulaire sont quand même enregistrées et visibles dans l'admin, onglet Demandes.

## Administration
Adresse : votre-site.netlify.app/admin. Mot de passe vérifié côté serveur, jamais présent dans les pages publiques. 8 essais ratés bloquent l'adresse IP 15 minutes. Session valable 8 heures.

Onglets :
- Éditer le site : le site s'affiche dans l'admin ; cliquez sur n'importe quel texte pour l'écrire (gras, italique, liens), sur une photo pour la remplacer. Cliquer sur un élément affiche une barre : Bloc parent, Dupliquer, Supprimer. Les blocs supprimés se rétablissent sous l'aperçu. Les encadrés bleus renvoient vers les onglets Équipe, Budget, Sponsors, Formules, Réseaux.
- Équipe : ajouter, supprimer, réordonner les membres ; photo recadrable et zoomable, nom, rôle, parcours, motivation.
- Budget, Sponsors, Réseaux.
- Textes : tous les titres, paragraphes et boutons du site (**gras**, retour à la ligne).
- Images : remplacer n'importe quelle photo.
- Formules : nom, prix, « places limitées », tableau des contreparties.
- Vidéo et logos : emplacements proposés (grand-voile, spinnaker, coque), taille du logo sur chaque surface, filigrane Icam Voile, texte ou logo de démonstration.
- Sections : masquer une section, changer la vidéo YouTube.
- Demandes et E-mails.

Bouton « Publier les modifications » : le site est mis à jour immédiatement, sans republier le code.

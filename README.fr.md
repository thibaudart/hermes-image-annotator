# Image Annotator pour Hermes Desktop

[English documentation](README.md)

Annote au feutre une image dans une conversation Hermes Desktop et enregistre une copie PNG. L’image originale et le brouillon restent intacts. Rien n’est envoyé automatiquement.

## Installation locale

1. Télécharge [`plugin.js`](plugin.js) depuis ce dépôt.
2. Enregistre-le dans `$HERMES_HOME/desktop-plugins/image-annotator/plugin.js`. Par défaut, le dossier Hermes est `~/.hermes` sur macOS et Linux, ou `%USERPROFILE%\.hermes` sous Windows.
3. Hermes Desktop détecte le plugin. S’il n’apparaît pas, ouvre la palette de commandes (`⌘K` sur macOS, `Ctrl+K` sous Windows/Linux) et lance **Reload desktop plugins**.

Aucune compilation, dépendance ou clé API n’est nécessaire. Le plugin fonctionne dans **Hermes Desktop**, pas en ligne de commande. Pour le désinstaller, supprime le dossier `image-annotator`, puis recharge les plugins de bureau.

## Utilisation

1. Clique sur une image du chat pour ouvrir la visionneuse, puis sur **Annoter**.
2. Choisis la couleur et l’épaisseur du feutre, puis dessine sur l’image.
3. Clique sur **Enregistrer le PNG**, puis choisis où sauvegarder la copie. Pour répondre avec cette image, joins-la avec le menu **+** de Hermes Desktop ou glisse le fichier dans le brouillon.

**Annuler le trait** retire le dernier tracé. **Échap** quitte l’éditeur. L’interface suit la langue de Hermes Desktop en français ou en anglais.

## Compatibilité et confidentialité

- C’est la version **autonome**. Elle a été testée sur macOS dans Hermes Desktop (révision source `caafe5389a`). Elle s’appuie sur la structure actuelle de la visionneuse, qui peut changer après une mise à jour. Les autres plateformes n’ont pas été testées.
- Pas de télémétrie, d’envoi d’image ni d’accès au presse-papiers système. Le dessin se fait en local. Le PNG est écrit uniquement lorsque tu l’enregistres. Pour une image HTTP(S) affichée, l’éditeur peut retenter la même URL sans référent, via une requête CORS anonyme. Les sites qui bloquent l’export empêchent l’annotation.
- Les très grandes images sont ramenées à 4 096 pixels sur le côté le plus long et à environ 12 mégapixels. Une image animée devient un PNG fixe.
- **Catalogue Hermes :** pas encore référencé. La version autonome s’appuie sur l’interface interne de l’application pour étendre la visionneuse. L’ajout direct est volontairement désactivé tant que Hermes ne peut pas cibler le brouillon d’origine de façon sûre. Voir [la proposition d’intégration au SDK](docs/catalog.md).

[Test d’intégration Desktop](tests/README.md) · [Licence MIT](LICENSE)

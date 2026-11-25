# Image Annotator pour Hermes Desktop

[English documentation](README.md)

Annotez au feutre une image du chat et ajoutez une copie PNG au brouillon de réponse de la même conversation. L’image originale et le texte du brouillon restent intacts. Rien n’est envoyé tant que vous n’envoyez pas vous-même la réponse.

**Préversion SDK (`0.2.0-alpha.1`).** Ce paquet unifié n’est pas référencé dans le catalogue Hermes et n’est pas destiné aux versions de Desktop déjà publiées. Il nécessite deux API proposées du SDK : l’action de la visionneuse d’images du chat (avec `readImage()` et la référence du brouillon d’origine) et `host.composer.attachImage`, qui cible ce brouillon. Voir [l’état de la compatibilité et du catalogue](docs/catalog.md) et [les instructions de test en environnement isolé](tests/README.md). La branche `main` contient le prototype autonome de téléchargement PNG, absent de ce paquet.

## Utilisation sur une version de test compatible

1. Dans un environnement Hermes isolé, placez le paquet unifié dans `$HERMES_HOME/plugins/image-annotator/` en conservant les emplacements de `plugin.yaml`, `__init__.py` et `desktop/plugin.js`. Dans **Capacités → Plugins**, activez l’option **Desktop** du paquet. Le volet Agent ne fait rien et n’a pas besoin d’être activé.
2. Ouvrez une image éligible dans **l’historique d’une conversation** et cliquez sur **Annoter** dans la visionneuse. Choisissez la couleur et l’épaisseur du feutre, puis dessinez sur la copie. **Annuler le trait** retire le dernier tracé ; **Annuler** ou **Échap** ferme l’éditeur sans joindre de fichier.
3. Cliquez sur **Joindre à la réponse**. Hermes valide le PNG et l’ajoute localement au brouillon d’origine. Si ce brouillon n’est plus disponible, l’opération échoue au lieu de joindre l’image à une autre conversation.

L’interface suit la langue de Desktop (français ou anglais, avec l’anglais par défaut). Seules les images dont les données sont déjà chargées et accessibles via le SDK sont éligibles. Les grandes images peuvent être réduites à 4 096 pixels sur le côté le plus long et à 12 mégapixels. Une image animée devient un PNG fixe. Le PNG ne doit pas dépasser la limite de 16 Mio imposée par Hermes.

## Confidentialité et autorisations

- Le plugin ne lit que l’image sélectionnée, via le SDK Desktop, après un clic sur **Annoter**. Le dessin et la conversion se font localement. Le plugin ne consulte pas les autres messages, ne lit pas les chemins sources et ne recharge pas les URL.
- Sa seule écriture dans Hermes est l’ajout du PNG à votre demande. Hermes stocke le fichier localement pour le brouillon ; le plugin ne téléverse et n’envoie rien.
- Aucune télémétrie, requête réseau externe, consultation du presse-papiers, commande système, tâche de fond, gestion d’identifiants, route serveur ni dépendance. Le point d’entrée Python n’enregistre rien.

[Licence MIT](LICENSE)

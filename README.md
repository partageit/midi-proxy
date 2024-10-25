# midi proxy

## Prérequis

dans midi loop, créer une entrée midi proxy

## Configuration ableton

dans les réglages midi :

| surface de contrôle | entrée     | sortie            |
|---------------------|------------|-------------------|
| Launch control XL   | midi proxy | Launch control XL |

Ports d'entrée :

- les 2 launch control : tout décocher
- midi proxy qui est vite renommé launch control xl (midi proxy) : cocher piste et télécommande

Ports de sortie :

- launch control : tout décocher
- midi proxy : cocher télécommande

## reste à faire

- [ ] un moyen de mettre à jour l'état de song (nouveaux clips, tracks, ...)
- [x] quand on change de mode user factory, débrancher les personnalisations
- [ ] bouton solo par exemple déclenche le mode session ring
- [x] découper le ring en lignes de la largeur du nombre de tracks
- [x] trouver un moyen de connaître le template n'importe quand -> on force au démarrage...
- [ ] boutons gauche droite pour le ring
- [ ] Button et Buttons génériques, avec LaunchControlXlButton, ...
- [ ] au changement de set, on perd le ring, il faut le réactiver et détecter qu'on a changé de live
- [ ] les groupes ne sont pas arrêtables/démarrables

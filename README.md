# midi proxy

Application en node pour personnaliser mes équipements midi, notamment mon novation launch control xl cassé, sans packaging ou configuration, pour le fun.

Les personnalisations :

- les faders 2 et 4 à 8 cassés sont désactivés pour ne pas envoyer du signal en continu
- sur template user qui utilise le channel midi 4:
  - un session ring sur la première ligne de pads, avec des couleurs, un déplacement avec les flèches haut bas gauche droite
  - le bouton device démarre et arrête, avec indicateur lumineux
  - le bouton solo désactive les fonctionnalités
  - le bouton record arm mets à jour les nouvelles pistes et scènes, c'est pas encore automatique

## Prérequis

dans midi loop, créer une entrée midi proxy

## AbletonOSC

c'est une surface virtuelle, pour communiquer avec cette application.

git clone cette version : https://github.com/partageit/AbletonOSC dans `Documents/Ableton/User Library/Remote Scripts`.

c'est un fork avec la gestion des session rings (le rectangle rouge pilotée par le périphérique midi).

## Configuration ableton

dans les réglages midi :

| surface de contrôle | entrée     | sortie            |
|---------------------|------------|-------------------|
| Launch control XL   | midi proxy | Launch control XL |
| Ableton OSC         | aucune     | aucune            |

Ports d'entrée :

- les 2 launch control : tout décocher
- midi proxy qui est vite renommé launch control xl (midi proxy) : cocher piste et télécommande

Ports de sortie :

- launch control : tout décocher
- midi proxy : cocher télécommande

## reste à faire

- [ ] un moyen de mettre à jour finement l'état de song (nouveaux clips, tracks, ...)
- [ ] le groupe n'arrête pas tout ?

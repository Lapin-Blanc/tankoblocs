# TankoBlocs

Un jeu de programmation : on écrit avec des **blocs Blockly** le programme d'un tank, puis il affronte seul jusqu'à trois autres tanks dans une arène.

**▶ Jouer en ligne : <https://lapin-blanc.github.io/tankoblocs/>**

Les règles reprennent celles du projet open source [code-tanks](https://github.com/code-tanks/code-tanks) (Apache 2.0), où les tanks se programment en Python, Rust, Java… Ici, tout se fait en blocs, dans le navigateur, sans serveur ni Docker.

## Lancer le jeu

- **En ligne :** <https://lapin-blanc.github.io/tankoblocs/>, rien à installer.
- **Sur son ordinateur :** télécharger le dépôt, puis ouvrir `index.html` dans Chrome, Edge ou Firefox (double-clic). Tout est inclus, y compris Blockly : aucune connexion Internet n'est nécessaire.
- **Avec un petit serveur local** (si le navigateur refuse les fichiers locaux) :
  ```bash
  python3 -m http.server 8000
  ```
  puis ouvrir <http://localhost:8000>.

Les tanks sont enregistrés dans le navigateur (`localStorage`). Le bouton **Exporter** produit un fichier `.tank.json` qu'on peut partager ou réimporter, par exemple pour faire s'affronter les tanks de toute une classe.

## Ce qu'on trouve dans le jeu

| Onglet | Contenu |
| --- | --- |
| 🎓 Missions | Parcours guidé de 11 missions pour débuter (voir ci-dessous). C'est l'onglet affiché à la première visite. |
| 🛠️ Atelier | Éditeur Blockly en français, couleur et nom du tank, bibliothèque « Mes tanks », import/export, exemples à étudier, aperçu du JavaScript généré, bouton « Combattre ». |
| ⚔️ Arène | De 1 à 4 participants (mes tanks, exemples, tank en cours d'édition, pilote clavier), lecture, pause, tick par tick, vitesse ×¼ à ×16, tableau de bord, journal, résultats et **championnat express** (des dizaines de manches calculées en une fraction de seconde). |
| 📖 Guide | Règles complètes, repère et angles, file d'ordres, événements, référence des blocs, astuces de stratégie. |

### Le parcours de missions

Onze missions courtes, une notion à la fois. Chacune propose :
- seulement les blocs utiles dans la boîte à outils ;
- un programme de départ ;
- des indices progressifs et une solution ;
- un objectif vérifié automatiquement dans l'arène, avec un message qui explique l'échec (« Ton tank a percuté un mur ! As-tu tourné du bon côté ? »).

| # | Mission | Notion | Objectif |
| --- | --- | --- | --- |
| 1 | Premiers pas | le programme principal | atteindre une zone droit devant |
| 2 | Tourner | les angles | atteindre une zone au-dessus |
| 3 | Enchaîner | les séquences | passer par 3 balises en escalier |
| 4 | Le programme qui se répète | les répétitions | faire le tour d'un carré avec 3 blocs au maximum |
| 5 | Feu ! | tirer | toucher 3 fois une cible en face |
| 6 | Compter | les variables | compter ses tirs réussis et les annoncer « 1 », « 2 », « 3 » |
| 7 | Viser | les coordonnées | toucher une cible au point (250, 180) |
| 8 | Le radar | les événements | trouver une cible cachée (position aléatoire) |
| 9 | Attention au mur | les conditions | parcourir 1500 px sans toucher un mur |
| 10 | Cible mobile | réagir vite | toucher 3 fois le Tourniquet |
| 11 | Premier duel | tout réunir | battre la Sentinelle |

Le programme et la progression de chaque mission sont gardés dans le navigateur. « Quitter la mission » ramène à l'atelier libre, avec le tank qu'on y avait laissé. Les missions 10 et 11 partent du programme écrit lors de la mission précédente qui s'y rapporte.

### Les blocs

- **Événements** : au démarrage · quand je n'ai plus d'ordres · quand mon radar détecte (tank / obus / mur) · quand je suis touché · quand mon obus touche.
- **Mouvement** : avancer/reculer (en ticks ou en pixels), tourner le tank/canon/radar (en ticks ou en degrés), orienter vers un angle ou un point, attendre, et « en même temps » qui combine déplacement, trois rotations et tir dans un même tick.
- **Canon et radar** : tirer (maintenant / dès que prêt), annuler les ordres prévus, (dé)verrouiller le canon ou le radar, allumer/éteindre le radar, s'autodétruire.
- **Capteurs** : position, directions, santé, recharge, ordres en attente, temps, adversaires en vie, angle vers un point, distance, écart d'angle, constantes du jeu.
- **Objet détecté** : position, distance, angle pour le viser, direction, vitesse, nom et type de l'objet d'un événement.
- **Journal** : dire (bulle au-dessus du tank), afficher (journal de l'arène).
- Les blocs standard de Blockly : logique, boucles, maths (en degrés), texte, listes, variables et fonctions.

### Les exemples

Six tanks d'exemple, construits avec les mêmes blocs que ceux des élèves : **Mannequin** et **Tourniquet** (cibles), **Toupie** (le « spin bot » de la documentation d'origine), **Sentinelle**, **Vagabond** et **Chasseur**. Leurs niveaux ont été vérifiés par des séries de matchs : en duel, le Chasseur bat les autres exemples dans environ 3 cas sur 4.

## Règles (fidèles à code-tanks)

- Arène de 1024 × 640, origine au centre, axe y vers le haut ; 60 ticks par seconde.
- À chaque tick, chaque tank exécute **un** ordre pris en tête de sa file. Quand la file est vide, le programme principal est rappelé. Les ordres ajoutés par un événement passent **devant** les autres.
- Tank : 100 px/s, rotation 0,3π rad/s (0,9° par tick) ; obus : 200 px/s ; recharge : 60 ticks ; rayons de 19 px (tank) et 5 px (obus).
- Le canon verrouillé suit le châssis, le radar verrouillé suit le canon. Le radar est un triangle très fin (50 px de large au bout de 1664 px) qui ne signale un objet qu'au moment où celui-ci **entre** dans le faisceau. Il ignore ses propres obus et les épaves.
- 10 dégâts pour un obus, un choc contre un mur ou un choc entre tanks (une seule fois par contact).
- Fin quand il ne reste qu'un tank, ou au temps limite. **Vainqueur : le plus de dégâts infligés.**

### Adaptations choisies

| Original | TankoBlocs | Pourquoi |
| --- | --- | --- |
| Commande `REQUEST_INFO` puis événement | Blocs « capteurs » lisibles à tout moment | Plus naturel en blocs. |
| `CLEAR_COMMANDS` exécuté au tick suivant (efface aussi les nouveaux ordres) | « annuler les ordres prévus » agit immédiatement | Sinon le bloc annulerait la réaction elle-même. |
| Tanks alignés au départ, tous tournés vers l'est | Positions et directions tirées au hasard à partir d'une **graine** | Parties variées mais rejouables à l'identique. |
| Partie de 600 ticks | 30 s à 5 min (1 min par défaut) | Laisser le temps aux stratégies. |
| Programme en erreur ou sans réponse : autodestruction | Tank « en panne » (immobile), erreur affichée | Plus instructif pour déboguer. |
| Tirer sur une épave compte comme des dégâts infligés | Les épaves arrêtent les obus sans rapporter de points | Correction d'un effet de bord. |
| Égalité de dégâts : aucun vainqueur | Départage par la santé restante, puis le temps de survie | Moins de matchs nuls. |
| Radians, pixels par seconde | Degrés (comme les blocs de maths de Blockly) et pixels par tick | Cohérence avec les blocs. |

Les programmes sont protégés : une boucle infinie (plus de 200 000 tours dans un même événement) ou une récursion sans fin met le tank en panne sans bloquer la page. Le hasard (`nombre aléatoire`) est reproductible : une partie rejouée avec la même graine est identique.

## Organisation du code

```
index.html          interface et guide
css/style.css       styles
js/engine.js        moteur de simulation (sans affichage) : règles, physique, radar, score
js/runtime.js       exécution du code généré : API « tank. », variables par tank, protection des boucles
js/blocks.js        blocs Blockly, générateurs JavaScript, thème, boîte à outils, compilation
js/bots.js          tanks d'exemple (construits en blocs) et modèle de départ
js/missions.js      parcours : missions, boîtes à outils réduites, vérification des objectifs
js/renderer.js      dessin de l'arène (canvas)
js/audio.js         sons synthétisés (WebAudio)
js/storage.js       bibliothèque locale, import/export
js/app.js           atelier, arène, championnat, clavier
vendor/blockly/     Blockly 12.5.1 (Apache 2.0)
tests/index.html    tests automatiques, à ouvrir dans le navigateur
```

Le moteur n'a aucune dépendance au DOM : `new TankEngine.Match({ entrants, seed, maxTicks })` puis `match.step()` jusqu'à `match.finished`.

Après une modification d'un fichier `js/` ou `css/`, incrémenter `?v=` dans `index.html` pour que les navigateurs ne gardent pas l'ancienne version en cache.

## Tests

Ouvrir `tests/index.html` (de la même façon que le jeu). 61 tests vérifient :
- les règles : verrouillages, recharge, déplacements et rotations, dégâts (murs, chocs, obus), radar, ordre de la file ;
- les blocs « orienter » et « tirer dès que prêt », les pannes, les boucles infinies, la fin de partie, la reproductibilité, le classement ;
- la compilation puis l'exécution de chaque exemple ;
- pour chaque mission : la solution réussit (sur 10 positions de départ quand elles sont aléatoires), le programme de départ ne suffit pas, et tous les blocs de la solution figurent dans la boîte à outils de la mission.

## Licence

Copyright 2026 Fabien Toune. TankoBlocs est distribué sous **licence Apache 2.0** : voir [LICENSE](LICENSE) et [NOTICE](NOTICE). Vous pouvez l'utiliser, le modifier et le redistribuer, y compris en classe, en conservant ces mentions.

- Blockly : Apache 2.0, © Google LLC (voir `vendor/blockly/`).
- Règles du jeu : inspirées de code-tanks (Apache 2.0). Le code, les graphismes et les sons de TankoBlocs sont originaux ; aucun fichier du projet d'origine n'est repris.

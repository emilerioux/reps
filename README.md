# Reps — prototype de l'écran « Séance »

**En ligne :** https://emilerioux.github.io/reps/
**Ancienne app, intacte :** https://emilerioux.github.io/workout-tracker/

Prototype d'un **seul écran** : la séance guidée. Il sert à juger la direction
avant de refaire le reste de l'app. L'app d'origine (`../workout-tracker/`)
n'est ni modifiée ni lue.

## Lancer

```bash
cd reps && python3 -m http.server 8811
# puis http://localhost:8811
```

Ouvre-le en vue mobile (Chrome → Inspecter → icône téléphone) : les gestes
sont pensés pour le doigt.

## Les gestes à essayer

| Geste | Ce qu'il faut sentir |
| --- | --- |
| **Glisser la carte** vers la gauche/droite | La carte colle au doigt au pixel près. Un petit coup sec (flick) l'envoie plus loin qu'un glissé lent : l'app calcule où le mouvement *allait* s'arrêter. Au premier et au dernier exercice, ça résiste au lieu de bloquer net. |
| **Attraper une carte en plein vol** | Elle repart de là où elle est, sans saut. Aucune animation ne verrouille l'écran. |
| **Tirer un chiffre vers le haut / le bas** | Le poids monte par 2,5 lb, les reps par 1. Un cran = une micro-vibration. |
| **Valider une série** | Le bouton s'allume en vert dès que l'exercice est bouclé, et l'écran passe tout seul au suivant. |
| **Battre un record** | Bandeau orange qui descend du haut — et qui remonte **par le même chemin**. Une lueur part du chiffre. |
| **Fin de séance → tirer la feuille vers le bas** | Elle suit le doigt, résiste vers le haut, et un coup sec la referme même sans être descendue jusqu'en bas. |

## Ce qui vient du langage Apple

- **Ressorts, pas de durées fixes.** Tout est piloté par un ressort à deux
  paramètres (amortissement + réponse), comme SwiftUI. Il repart toujours de la
  valeur affichée → interruptible par construction.
- **Relais de vitesse.** La vitesse du doigt au relâchement devient la vitesse
  initiale du ressort : aucune couture entre le glissé et l'animation.
- **Projection de momentum.** `(v/1000)·d/(1−d)` avec `d = 0.998` — la formule
  du code d'exemple *Designing Fluid Interfaces*, pas la physique scolaire.
- **Élastique aux bords** plutôt qu'un mur.
- **Matériaux translucides** en haut et en bas, le contenu passe dessous ;
  fondu de bord au scroll au lieu d'un filet de 1px.
- **Typographie** : tracking négatif sur les gros titres, positif sur le
  micro-texte, chiffres tabulaires partout.
- **Accessibilité** : `prefers-reduced-motion` (les ressorts sautent à la
  cible, plus de lueur), `prefers-reduced-transparency` (surfaces opaques),
  `prefers-contrast` (bordures franches).

## Installer sur le téléphone

Ouvre https://emilerioux.github.io/reps/ dans Safari → Partager → « Sur l'écran
d'accueil ». L'icône est noire avec trois barres vertes — aucun risque de la
confondre avec l'ancienne (violette). Les deux apps cohabitent.

À chaque déploiement, **bumper `CACHE_NAME` dans `sw.js`**, sinon le téléphone
sert l'ancienne version depuis son cache.

## Données

Tout est sous le préfixe **`wt2-`** dans `localStorage` :
`wt2-sessions`, `wt2-prs`, `wt2-hint-seen`. Rien en commun avec l'app d'origine,
même si les deux tournent un jour sur le même domaine.

Le prototype s'amorce avec un historique plausible (5 semaines de séances) pour
que le streak et les records aient de quoi se comparer. Le bouton **↺** en haut
à droite, ou « Réinitialiser le prototype » en bas de la feuille de fin, efface
tout et recharge.

Un record est volontairement placé sous la valeur par défaut des *Élévations
latérales* : la première série validée déclenche la célébration.

## Pas encore fait

Le reste de la v2 : liste des programmes, onglet Log, Progression, Réglages,
et l'import des données depuis l'ancienne app.

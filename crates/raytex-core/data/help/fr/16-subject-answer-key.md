# Sujet et corrigé

Un même fichier donne le sujet d'un devoir et son corrigé. Chaque corrigé s'écrit juste après sa question : le sujet le cache et laisse la place pour répondre, le corrigé l'affiche dans un cadre.

## Commencer

- Un nouveau projet : le modèle **Devoir avec corrigé** (catégorie *Enseignants*).
- Un document déjà là : menu **Insertion › Sujet et corrigé › Corrigé**. RayTeX ajoute au préambule l'interrupteur (`\newif\ifcorrige`) et l'environnement `corrige`, puis écrit le corrigé là où est le curseur (le texte sélectionné y entre).

Les modèles **Contrôle avec corrigé** (classe `exam`) et **Feuille de TD** marchent de la même façon, comme tout document qui a déjà un interrupteur : la classe `exam` (`\printanswers`), le package `xsim` (`solution/print`), ou un `\newif`, un `\newtoggle` à lui nommé pour les corrigés (`corrige`, `corrections`, `solutions`…).

## Voir le sujet ou le corrigé

Au-dessus de l'aperçu, **Sujet | Corrigé** bascule l'interrupteur dans le préambule (une ligne : `\corrigefalse` devient `\corrigetrue`, `% \printanswers` devient `\printanswers`), puis compile. Ctrl+Z revient en arrière. Le même choix est dans *Insertion › Sujet et corrigé › Montrer les corrigés*, et dans la palette de commandes.

## Écrire

Le sous-menu **Insertion › Sujet et corrigé** écrit, au curseur :

| Entrée | Ce qui est écrit | Avec la classe `exam` |
|---|---|---|
| Exercice avec son barème | `\begin{exercice}[4 points] … \end{exercice}` : « Exercice 1 (4 points) », numéroté seul | `\question[2]` (dans `questions`) |
| Corrigé | `\begin{corrige} … \end{corrige}` : encadré dans le corrigé, absent du sujet ; du code ou du verbatim y passent | `solution` |
| Lignes pour répondre | `\lignesreponse{5}` : cinq lignes pointillées | `\fillwithdottedlines{3cm}` |
| Place pour répondre | `\espacereponse{3cm}` : un blanc | `\makeemptybox{3cm}` |
| Quadrillage pour répondre | `\quadrillage{4cm}` : des carreaux de 5 mm (TikZ) | `\fillwithgrid{4cm}` |

Les lignes, la place et le quadrillage n'apparaissent que dans le sujet. Chaque définition est écrite une fois dans le préambule, avec un commentaire qui dit ce qu'elle fait : la couleur du cadre ou son titre se changent là. Dans un document en anglais, les noms sont anglais (`solution`, `exercise`, `\answerlines`…). Avec `xsim`, seuls l'exercice et le corrigé sont proposés : ce package a ses propres réglages.

## Exporter

**Compiler ▾ › Exporter le sujet et le corrigé…** (ou *Exporter les deux*, au-dessus de l'aperçu) : choisissez le nom du sujet, le corrigé est écrit à côté (« Devoir - sujet.pdf », « Devoir - corrigé.pdf »). Chaque version est compilée à part : le document n'est pas modifié. La fenêtre d'export propose aussi l'un ou l'autre seul, et donne le total des points. Les images allégées et le PDF/A s'appliquent aux deux.

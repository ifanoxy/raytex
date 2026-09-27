# Dépannage

## « Aucune distribution TeX trouvée »

- Installez une distribution avec l'assistant (*Réglages › Distribution TeX*).
- Déjà installée ailleurs ? Ajoutez le dossier contenant `pdflatex` dans *Dossiers supplémentaires*, puis **Détecter à nouveau**.
- Une installation vient de se terminer ? Cliquez sur **Détecter à nouveau** : inutile de relancer labaguetex.

## « File `xyz.sty' not found »

Le package n'est pas installé. Cliquez sur **Installer** dans le panneau Problèmes, ou cherchez-le dans *Packages › CTAN*. Avec MiKTeX, les packages manquants peuvent s'installer automatiquement pendant la compilation.

## « Undefined control sequence »

La commande signalée n'existe pas : faute de frappe (`\textbff`), ou package non chargé. labaguetex propose la commande la plus proche ou le package à ajouter.

## Renvois « ?? » et citations « [?] »

Les numéros sont connus après une compilation complète. Compilez à nouveau ; si le problème persiste, l'étiquette ou la clé n'existe pas (voyez les avertissements).

## « Missing $ inserted »

Un symbole mathématique (`_`, `^`, `\alpha`…) est utilisé hors d'une formule. Entourez-le de `$…$`, ou échappez le caractère : `\_`.

## Le document compile, mais la mise en page est étrange

- **Overfull \hbox** : une ligne dépasse dans la marge. Reformulez, autorisez la césure d'un mot (`mot\-long`), ou chargez `microtype`.
- Les figures « partent » plus loin : c'est normal, LaTeX optimise leur placement. Utilisez `[htbp]` et des renvois plutôt que « ci-dessous ».

## La compilation est lente

- Le premier passage d'un document avec bibliographie et index est le plus long ; les suivants ne relancent que le nécessaire.
- TikZ et les grosses images ralentissent : préparez les figures complexes dans des projets `standalone` et incluez le PDF.
- Réglez *Compiler automatiquement* sur « À l'enregistrement » plutôt qu'« Après une pause ».

## Le PDF ne se met pas à jour

Vérifiez le panneau **Problèmes** : une erreur fatale empêche la production du PDF. Le panneau **Sortie** montre la sortie complète du compilateur, et *Ouvrir le fichier journal* ouvre le `.log`.

## Réinitialiser

- *Réglages › Fichier de réglages* ouvre le dossier des réglages.
- *Nettoyer les fichiers de compilation* supprime les fichiers auxiliaires du dossier `build/` (utile après une erreur dans un fichier `.aux`).

## Signaler un problème

labaguetex est libre et open source : signalez un bug ou proposez une amélioration sur le dépôt du projet, en joignant si possible un petit document qui reproduit le problème.

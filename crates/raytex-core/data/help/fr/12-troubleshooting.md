# Dépannage

## « Aucune distribution TeX trouvée »

- Installez une distribution avec l'assistant (*Réglages › Distribution TeX*).
- Déjà installée ailleurs ? Ajoutez le dossier contenant `pdflatex` dans *Dossiers supplémentaires*, puis **Détecter à nouveau**.
- Une installation vient de se terminer ? Cliquez sur **Détecter à nouveau** : inutile de relancer RayTeX.

## « File `xyz.sty' not found »

Le package n'est pas installé. Cliquez sur **Installer** dans le panneau Problèmes, ou cherchez-le dans *Packages › CTAN*. Avec MiKTeX, les packages manquants peuvent s'installer automatiquement pendant la compilation.

## MiKTeX : un fichier que vous n'avez pas demandé est introuvable

MiKTeX s'installe avec peu de packages et télécharge les autres pendant la compilation. Quand il ne le peut pas (pas de connexion, installation automatique coupée, dépôt qu'il n'arrive pas à lire), la compilation s'arrête sur un fichier « introuvable », souvent un fichier que vous n'avez jamais écrit :

- avec `\usepackage[french]{babel}`, c'est `french.ldf` (babel dit alors *Unknown option 'french'*) ou `scalefnt.sty`, que le français de babel charge de son côté ;
- avec une autre langue, c'est son fichier `.ldf`.

RayTeX le signale avant la compilation quand il s'agit d'une langue de babel, et dans tous les cas le problème porte le bouton **Installer**. Le fichier porte rarement le nom de son package (`scalefnt.sty` est dans `carlisle`, `french.ldf` dans `babel-french`, `tikz.sty` dans `pgf`) : RayTeX lit le vrai nom dans la base de MiKTeX et vous montre la commande avant de la lancer. Recompilez ensuite ; s'il manque encore un fichier, le même bouton revient pour lui.

Si l'installation échoue aussi : vérifiez la connexion, puis lancez *TeX › Mettre à jour tous les packages* (MiKTeX signale lui-même comme un problème majeur de n'avoir encore jamais cherché de mises à jour), et réessayez. L'installation automatique se règle dans *Réglages › Distribution TeX*.

## « Undefined control sequence »

La commande signalée n'existe pas : faute de frappe (`\textbff`), ou package non chargé. RayTeX propose la commande la plus proche ou le package à ajouter.

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

RayTeX est libre et open source : signalez un bug ou proposez une amélioration sur le dépôt du projet, en joignant si possible un petit document qui reproduit le problème.

## Signaler un problème

*Signaler un problème…* (palette de commandes, ou *Réglages › À propos*) prépare un rapport à coller dans une issue sur GitHub : la version de RayTeX et de votre système, votre distribution TeX, la façon dont le document est compilé, et les erreurs de la dernière compilation.

**Rien n'est envoyé d'ici.** Le rapport s'affiche en entier : vous le lisez, vous le copiez, et vous le collez où vous voulez. *Copier et ouvrir GitHub* le copie puis ouvre la page où écrire l'issue dans votre navigateur.

Le rapport ne dit pas qui vous êtes : le dossier du projet et votre nom d'utilisateur sont retirés des chemins. La fin de la sortie de la compilation n'y est que si vous la cochez, parce qu'elle peut citer des lignes de votre document.

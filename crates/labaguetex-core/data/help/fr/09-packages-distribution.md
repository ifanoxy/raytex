# Packages et distribution TeX

## Les distributions

labaguetex fonctionne avec **toutes** les distributions :

| Distribution | Systèmes | Particularité |
|---|---|---|
| TeX Live | Linux, macOS, Windows | La référence, complète |
| MacTeX | macOS | TeX Live pour Mac, avec outils |
| MiKTeX | Windows, Linux, macOS | Installe les packages à la demande |
| TinyTeX | tous | Très légère, s'agrandit selon vos besoins |
| Tectonic | tous | Moteur tout-en-un, télécharge ce qu'il faut |
| TeX Live du système | Linux (apt, dnf, pacman…) | Gérée par votre gestionnaire de paquets |

L'**assistant** (*Distribution TeX* dans les réglages, ou clic sur la barre d'état) :

- liste les distributions trouvées et vous laisse choisir celle à utiliser ;
- montre les outils disponibles (latexmk, biber, texdoc…) ;
- propose d'installer une distribution adaptée à votre système, en affichant les commandes exactes avant de les lancer ;
- permet d'ajouter un dossier personnalisé (installation portable).

## Tous les packages sont pris en charge

labaguetex **lit la source** des packages que charge votre document, quels qu'ils soient : leurs commandes, environnements et options apparaissent dans l'autocomplétion, même pour un package rare ou le vôtre. Les packages les plus courants bénéficient en plus d'une documentation détaillée en français et en anglais.

## La vue Packages

- **Ce projet** : les packages chargés, avec leur état ; ceux qui manquent s'installent d'un clic.
- **Installés** : tous les packages de votre distribution (plusieurs milliers).
- **CTAN** : le catalogue complet (plus de 7 000 packages), avec description, documentation et installation.

Pour chaque package : ses commandes (un clic les insère), ses environnements, ses options, sa documentation (`texdoc`) et sa page CTAN.

## Installer un package manquant

Quand la compilation échoue sur un fichier introuvable (`File 'xyz.sty' not found`), le panneau **Problèmes** propose **Installer**. labaguetex :

1. trouve le package qui fournit ce fichier ;
2. vous montre la commande (tlmgr, MiKTeX, ou votre gestionnaire de paquets Linux) ;
3. l'exécute : dans votre dossier personnel si possible, sinon en demandant le mot de passe administrateur ;
4. recompile.

Le suivi des installations est dans le panneau **Installations**.

## Mettre à jour

*TeX › Mettre à jour tous les packages* met à jour votre distribution (tlmgr, MiKTeX). Avec TeX Live installée pour tous les utilisateurs, le mot de passe administrateur est demandé.

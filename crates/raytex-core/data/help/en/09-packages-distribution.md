# Packages and TeX distribution

## Distributions

RayTeX works with **every** distribution:

| Distribution | Systems | Notes |
|---|---|---|
| TeX Live | Linux, macOS, Windows | The reference, complete |
| MacTeX | macOS | TeX Live for Mac, with tools |
| MiKTeX | Windows, Linux, macOS | Installs packages on demand |
| TinyTeX | all | Very light, grows with your needs |
| Tectonic | all | All-in-one engine, downloads what it needs |
| System TeX Live | Linux (apt, dnf, pacman…) | Managed by your package manager |

The **assistant** (*TeX distribution* in the settings, or click the status bar):

- lists the distributions found and lets you choose the one to use;
- shows the available tools (latexmk, biber, texdoc…);
- offers to install a distribution suited to your system, showing the exact commands before running them;
- lets you add a custom folder (portable installation).

## Every package is supported

RayTeX **reads the source** of the packages your document loads, whatever they are: their commands, environments and options appear in completion, even for a rare package or your own. The most common packages also come with detailed documentation in English and French.

## The Packages view

- **This project**: the packages loaded, with their status; missing ones install in one click.
- **Installed**: every package of your distribution (several thousands).
- **CTAN**: the whole catalogue (more than 7,000 packages), with description, documentation and installation.

For each package: its commands (a click inserts them), environments, options, documentation (`texdoc`) and CTAN page.

## Installing a missing package

When a build fails on a missing file (`File 'xyz.sty' not found`), the **Problems** panel offers **Install**. RayTeX:

1. finds the package providing the file;
2. shows you the command (tlmgr, MiKTeX, or your Linux package manager);
3. runs it: in your home folder when possible, otherwise asking for the administrator password;
4. builds again.

Installations are followed in the **Installations** panel.

## Updating

*TeX › Update all packages* updates your distribution (tlmgr, MiKTeX). With a system-wide TeX Live, the administrator password is requested.

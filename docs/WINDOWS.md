# RayTeX on Windows

RayTeX was written and tested on macOS first. This page lists what is needed
to build it on Windows, how to check the TeX distribution, and what is known
about the Windows version.

## 1. Check the TeX distribution (MiKTeX)

In PowerShell:

```powershell
where.exe pdflatex lualatex xelatex biber miktex initexmf
pdflatex --version
miktex --version
initexmf --report
```

- `where.exe` must find `pdflatex.exe` (usually in
  `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64` for an installation for one
  user, or `C:\Program Files\MiKTeX\miktex\bin\x64` for all users). RayTeX
  also looks in these folders when they are not in `PATH`.
- MiKTeX installs missing packages on the fly when **MiKTeX Console ›
  Settings › "Always install missing packages on-the-fly"** is chosen (or
  `initexmf --set-config-value="[MPM]AutoInstall=1"`). RayTeX asks MiKTeX to
  do it for its builds (setting *Install missing packages automatically*).
- Updating MiKTeX once after installing it avoids most problems:
  MiKTeX Console › Updates › Check for updates › Update now.

Once RayTeX is built, the command line gives the same report as the setup
window of the application:

```powershell
cargo run -p raytex-cli -- doctor
```

## 2. Build RayTeX

Needed once:

1. **Rust** with the MSVC toolchain: <https://rustup.rs> (`rustup-init.exe`,
   default choices).
2. **Visual Studio Build Tools** with the *Desktop development with C++*
   workload (the Rust installer offers it).
3. **Node.js** 22 or later: <https://nodejs.org>.
4. **WebView2**: included in Windows 10 (recent updates) and 11.
5. **Git** configured to keep the line endings of the repository:
   `git config --global core.autocrlf false` (the repository also has a
   `.gitattributes` for that).

Then, in the folder of the repository:

```powershell
npm ci
npm test
npm run check
cargo test --workspace
npm run app:dev      # the application, in development
npm run app:build    # installers in target\release\bundle\ (msi, nsis)
```

Tests with the local TeX distribution (the 114 common mistakes are there):

```powershell
cargo test -p raytex-core --release -- --ignored --skip ctan
```

## 3. End-to-end checks of the application

The self-test variables are set this way in PowerShell (development builds
only):

```powershell
$env:RAYTEX_CONFIG_DIR = "$env:TEMP\raytex-test"
$env:RAYTEX_SELFTEST = "C:\path\to\a\project"
$env:RAYTEX_SELFTEST_SCENES = "workflow"      # or fixes, files, projects, media
$env:RAYTEX_SELFTEST_ASSETS = "$env:TEMP\raytex-assets"
npm run app:dev
```

The result (`selftest: PASSED` / `FAILED`, then `… scenes PASSED`) is printed
in the terminal. `RAYTEX_CONFIG_DIR` keeps the settings and the session of
the installed application untouched.

## 4. What is specific to Windows

Already in place:

- MiKTeX, TeX Live and TinyTeX found in their usual folders, with or without
  `PATH`; `.exe` added to tool names; no console window when a tool runs.
- Characters typed with **AltGr** (Ctrl + Alt for the page: `{ [ @ \ €` on
  AZERTY) are never taken for shortcuts; **Ctrl** plays the role of ⌘
  (Ctrl + click adds a file to the selection of the project tree).
- A `.tex` opened from Explorer while RayTeX runs goes to the running window
  (a single instance of the application).
- File names valid on Windows (checked by the CI), line endings kept (LF).

To check on a real Windows machine (the CI only compiles and runs the tests):

- [ ] The application starts, finds MiKTeX, compiles a new project.
- [ ] Packages missing from MiKTeX are installed during the build.
- [ ] Projects in a folder whose path has spaces or accents
      (`C:\Users\Prénom Nom\Documents\RayTeX`).
- [ ] SyncTeX both ways, PDF preview, export.
- [ ] Opening a `.tex` from Explorer (double click, *Open with*), with and
      without RayTeX running.
- [ ] Shortcuts on an AZERTY keyboard (Ctrl + Z / Y, Ctrl + S, AltGr
      characters in the editor).
- [ ] Trash, file watching (a file changed by another editor), drag and drop
      from Explorer.
- [ ] Fonts of the system in the font window.
- [ ] The installer (MSI or NSIS) and the file associations it registers.

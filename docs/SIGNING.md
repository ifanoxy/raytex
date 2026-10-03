# Signing and verifying the releases

Without a signature, Windows (SmartScreen) and macOS (Gatekeeper) warn that the publisher of RayTeX is unknown. The *Release* workflow (`.github/workflows/release.yml`) signs the installers as soon as the secrets below exist; until then it builds them unsigned, as before. Every release, signed or not, gets a checksums file and a build provenance attestation.

## Windows: SignPath (free for open-source projects)

[SignPath Foundation](https://signpath.org) signs open-source projects for free, with its own certificate, as long as the installers are built by GitHub Actions from the public repository.

1. Make the repository public, then apply on [signpath.org](https://signpath.org) (project: RayTeX, repository `ifanoxy/raytex`, license MIT/Apache-2.0).
2. Once accepted, SignPath gives an organization, a project and a signing policy. In the repository: *Settings → Secrets and variables → Actions*:
   - variables: `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` (default `raytex`), `SIGNPATH_POLICY_SLUG` (default `release-signing`);
   - secret: `SIGNPATH_API_TOKEN` (a SignPath user that may submit signing requests).
3. In SignPath, the project's artifact configuration signs the `.exe` and `.msi` files of the uploaded artifact (a zip containing them).

The *Windows signature* job then downloads the installers of the draft release, has SignPath sign them, and puts the signed files in their place. SmartScreen may still warn for the first downloads of a new version, until the signature has a reputation.

If a security product wrongly reports a file, submit it to [Microsoft](https://www.microsoft.com/wdsi/filesubmission) (or to the vendor concerned) as a false positive.

## macOS: Developer ID and notarization (Apple Developer Program)

Requires the [Apple Developer Program](https://developer.apple.com/programs/) (99 USD a year, open to individuals).

1. In Xcode or on developer.apple.com, create a **Developer ID Application** certificate, export it with its key as a `.p12` file, protected by a password.
2. Create an app-specific password for your Apple ID on [account.apple.com](https://account.apple.com).
3. Add these repository secrets:

   | Secret | Value |
   | --- | --- |
   | `APPLE_CERTIFICATE` | the `.p12` file in base64: `base64 -i certificate.p12 \| pbcopy` |
   | `APPLE_CERTIFICATE_PASSWORD` | the password of the `.p12` file |
   | `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Your Name (TEAMID)` |
   | `APPLE_ID` | the e-mail of the Apple account |
   | `APPLE_PASSWORD` | the app-specific password |
   | `APPLE_TEAM_ID` | the team ID (10 characters) |

The macOS builds are then signed and notarized by Apple: they open without any warning.

## Updates offered by the application

At start (unless turned off in *Settings → About*), RayTeX reads `latest.json` in the latest GitHub release and offers the new version; it installs only files signed with the project's **update key** (a key of Tauri's updater, distinct from the certificates above), whose public half is in `crates/raytex-desktop/tauri.conf.json` (`plugins.updater.pubkey`).

1. The private key is `~/.tauri/raytex-updater.key` on the maintainer's computer (made with `npx tauri signer generate`). **Keep a copy in a safe place**: without it, the installed applications can no longer be updated (a new key means a new version to download by hand).
2. Add these repository secrets: `TAURI_SIGNING_PRIVATE_KEY` (the content of the key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty, the key has no password).
3. Then every release also contains the update files (`.app.tar.gz`, `.sig`…) and `latest.json`. When SignPath signs the Windows installers, their update signatures are made again on the signed files.

Updates install themselves on Windows, macOS and from the AppImage on Linux; with a `.deb` or `.rpm`, RayTeX opens the download page instead when it cannot install.

## Linux, and every file: checksums and provenance

Linux has no central check: trust comes from what anyone can verify.

- **`SHA256SUMS.txt`** in every release lists the SHA-256 fingerprint of each file (the download page shows them too):
  ```bash
  sha256sum --ignore-missing -c SHA256SUMS.txt     # Linux
  shasum -a 256 --ignore-missing -c SHA256SUMS.txt # macOS
  certutil -hashfile RayTeX_x.y.z_x64-setup.exe SHA256  # Windows
  ```
- **Build provenance** (public repository): GitHub certifies that each file was built by the *Release* workflow of `ifanoxy/raytex`, from the tagged commit:
  ```bash
  gh attestation verify RayTeX_x.y.z_amd64.AppImage --repo ifanoxy/raytex
  ```

Later, a [Flathub](https://flathub.org) package (built by Flathub from the source) would bring RayTeX to the software centres of Linux distributions.

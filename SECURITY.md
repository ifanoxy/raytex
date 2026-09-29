# Security policy

## Supported versions

Security fixes are made on the latest release and on the `main` branch.

## Reporting a vulnerability

Please do **not** open a public issue. Report it privately through
[GitHub's security advisories](https://github.com/ifanoxy/raytex/security/advisories/new),
with the steps to reproduce it and, if you can, the version and operating
system. You will get an answer within a week; once a fix is released, the
advisory is published with credit to you (unless you prefer otherwise).

## What RayTeX does that matters for security

- It runs the TeX programs of the installed distribution on your documents.
  Shell escape (`-shell-escape`) is **off** by default; turn it on only for
  documents you trust (minted, some TikZ externalisation).
- Installing a distribution or packages runs the commands shown to you
  first; administrator rights are asked only when needed.
- The interface can only write inside the open project (and the user
  templates folder); the files of the TeX distribution are opened read-only.
- RayTeX itself uses the network only for the CTAN catalogue and package
  pages (ctan.org); packages and distributions are downloaded by the TeX
  distribution's own tools (tlmgr, MiKTeX), when you ask for them.

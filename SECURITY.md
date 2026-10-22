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
- The only thing RayTeX asks the network by itself is whether a new version
  is out, at start (GitHub; *Settings › About* turns it off). Everything
  else waits for you: the CTAN catalogue and package pages (ctan.org), a
  reference looked up by its DOI or arXiv number (doi.org, arxiv.org), the
  dictionaries of the spell checker (downloaded once, after you agree), and
  the installation of a distribution or a package (by the distribution's
  own tools, tlmgr or MiKTeX, the commands shown first). Your documents are
  never sent anywhere; *Report a problem* opens a page in your browser with
  what you chose to say.

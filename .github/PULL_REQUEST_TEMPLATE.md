## What and why

<!-- What this change does and the problem it solves; link the issue if there is one. -->

## Checks

- [ ] `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `cargo test --workspace` (and `cargo test -p raytex-core --release -- --ignored` with a TeX distribution, for engine changes)
- [ ] `npm test`, `npm run check`, `npm run build`
- [ ] Texts in English **and** French (`ui/lib/locales`, data files)
- [ ] `CHANGELOG.md` updated for user-visible changes
- [ ] Screenshots attached for visible interface changes

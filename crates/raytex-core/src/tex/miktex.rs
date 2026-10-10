//! What MiKTeX knows of its own packages, read from its files.
//!
//! MiKTeX keeps the manifest of every package of its repository, installed
//! or not, in one file (`miktex/config/package-manifests.ini`): a section
//! per package, and a `run[]=` line per file it installs. The package that
//! holds a file is read there, without the network.
//!
//! This matters because a file seldom has the name of its package:
//! `scalefnt.sty` (which French for babel loads) is in `carlisle`,
//! `tikz.sty` in `pgf`, `ngerman.ldf` in `babel-german`. Asking MiKTeX for a
//! package named like the file installs nothing ("The requested package is
//! unknown", with a code that says success).

use std::path::{Path, PathBuf};

use super::discovery::Distribution;

/// Name of the file that lists the packages of the repository.
const MANIFESTS: &str = "miktex/config/package-manifests.ini";

/// The manifest files of this MiKTeX, the most recent first: the one of the
/// installation, and those of the roots a user or an administrator updates.
pub fn manifest_files(dist: &Distribution) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    // <root>/miktex/bin[/x64]
    roots.extend(
        dist.bin_dir
            .ancestors()
            .skip(1)
            .take(4)
            .map(Path::to_path_buf),
    );
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    for base in [env("LOCALAPPDATA"), env("APPDATA"), env("ProgramData")]
        .into_iter()
        .flatten()
    {
        roots.push(base.join("MiKTeX"));
    }
    if let Some(dirs) = directories::BaseDirs::new() {
        let home = dirs.home_dir();
        for tree in ["install", "config", "data"] {
            roots.push(home.join(".miktex/texmfs").join(tree));
            roots.push(
                home.join("Library/Application Support/MiKTeX/texmfs")
                    .join(tree),
            );
        }
    }
    for shared in [
        "/usr/local/share/miktex-texmf",
        "/usr/share/miktex-texmf",
        "/var/lib/miktex-texmf",
    ] {
        roots.push(shared.into());
    }
    let mut found: Vec<(std::time::SystemTime, PathBuf)> = roots
        .into_iter()
        .map(|r| r.join(MANIFESTS))
        .filter_map(|f| Some((f.metadata().ok()?.modified().ok()?, f)))
        .collect();
    found.sort_by_key(|a| std::cmp::Reverse(a.0));
    found.dedup_by(|a, b| a.1 == b.1);
    found.into_iter().map(|(_, f)| f).collect()
}

/// The package that installs each of `files` (`scalefnt.sty` → `carlisle`),
/// as the manifests in `text` say; `None` for a file no package installs.
///
/// A file is matched by its whole name (`french.ldf` is not
/// `datenumberfrench.ldf`). When several packages hold a file of that name,
/// the one of the released tree wins over the development one (`latex-dev`),
/// and a file TeX reads (`texmf/tex/…`) over any other.
pub fn packages_of(text: &str, files: &[String]) -> Vec<Option<String>> {
    // The best candidate so far for each file, with its rank (lower is better).
    let mut best: Vec<Option<(u8, &str)>> = vec![None; files.len()];
    let mut section = "";
    for line in text.lines() {
        if let Some(name) = line.strip_prefix('[') {
            section = name.trim_end().trim_end_matches(']');
            continue;
        }
        let Some(path) = line.strip_prefix("run[]=") else {
            continue;
        };
        let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
        for (i, wanted) in files.iter().enumerate() {
            if !name.eq_ignore_ascii_case(wanted) {
                continue;
            }
            let rank = u8::from(!path.starts_with("texmf/tex/")) * 2
                + u8::from(path.contains("-dev/") || section.ends_with("-dev"));
            if best[i].is_none_or(|(r, _)| rank < r) {
                best[i] = Some((rank, section));
            }
        }
    }
    best.into_iter()
        .map(|b| b.map(|(_, s)| s.to_owned()))
        .collect()
}

/// The packages of this MiKTeX that install `files`, read from its
/// manifests; `None` for a file they do not name, or when there are none.
pub fn packages_of_files(dist: &Distribution, files: &[String]) -> Vec<Option<String>> {
    let mut out: Vec<Option<String>> = vec![None; files.len()];
    for manifest in manifest_files(dist) {
        let Ok(text) = std::fs::read_to_string(&manifest) else {
            continue;
        };
        for (slot, found) in out.iter_mut().zip(packages_of(&text, files)) {
            if slot.is_none() {
                *slot = found;
            }
        }
        if out.iter().all(Option::is_some) {
            break;
        }
    }
    out
}

/// Whether what MiKTeX printed says that it did nothing: it ends some
/// failures ("The requested package is unknown") with the code of a success.
pub fn refused(output: &str) -> bool {
    output.contains("Sorry, but")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Lines of a real `package-manifests.ini` (MiKTeX 26.5).
    const SAMPLE: &str = "[algorithms]\nrun[]=texmf/tpm/packages/algorithms.tpm\nrun[]=texmf/tex/latex/algorithms/algorithm.sty\n\
[babel-french]\ncopyrightOwner=Daniel Flipo\nrun[]=texmf/tpm/packages/babel-french.tpm\nrun[]=texmf/tex/generic/babel-french/french3.ldf\nrun[]=texmf/tex/generic/babel-french/french.ldf\nrunSize=132313\n\
[babel-french__doc]\ndoc[]=texmf/doc/generic/babel-french/frenchb.pdf\n\
[babel-german]\nrun[]=texmf/tex/latex/babel-german/ngerman.ldf\n\
[carlisle]\nrun[]=texmf/tex/latex/carlisle/scalefnt.sty\n\
[datenumber]\nrun[]=texmf/tex/latex/datenumber/datenumberfrench.ldf\n\
[latex-graphics-dev]\nrun[]=texmf/tex/latex-dev/graphics/graphicx.sty\n\
[graphics]\nrun[]=texmf/tex/latex/graphics/graphicx.sty\n\
[lwarp]\nrun[]=texmf/tex/latex/lwarp/lwarp-graphicx.sty\n\
[pgf]\nrun[]=texmf/tex/latex/pgf/frontendlayer/tikz.sty\n\
[polyglossia]\nrun[]=texmf/tex/latex/polyglossia/gloss-french.ldf\n";

    #[test]
    fn a_file_is_tied_to_the_package_that_installs_it() {
        let files: Vec<String> = [
            "scalefnt.sty",
            "french.ldf",
            "ngerman.ldf",
            "tikz.sty",
            "graphicx.sty",
            "algorithm.sty",
            "FRENCH.LDF",
            "nothing.sty",
        ]
        .map(String::from)
        .to_vec();
        let found = packages_of(SAMPLE, &files);
        let found: Vec<Option<&str>> = found.iter().map(|p| p.as_deref()).collect();
        assert_eq!(
            found,
            [
                Some("carlisle"),
                Some("babel-french"),
                Some("babel-german"),
                Some("pgf"),
                // Not the development tree, though it comes first in the file.
                Some("graphics"),
                Some("algorithms"),
                Some("babel-french"),
                None
            ]
        );
    }

    #[test]
    fn a_refusal_is_not_a_success() {
        assert!(refused("Sorry, but: The requested package is unknown."));
        assert!(!refused("Installing package babel-german..."));
    }
}

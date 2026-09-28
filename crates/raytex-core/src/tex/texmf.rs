//! Index of the files installed in a TeX distribution.
//!
//! Knowing every installed `.sty` and `.cls` lets RayTeX complete
//! `\usepackage{…}` with *all* installed packages, tell whether a package
//! is missing before compiling, and read the source of any package to learn
//! its commands (see [`super::packages`]).
//!
//! * TeX Live / MacTeX / TinyTeX / system TeX Live: the `ls-R` databases
//!   listed by `kpsewhich --all ls-R`, plus `TEXMFHOME` (which has none);
//! * MiKTeX: its installation and user roots are walked;
//! * Tectonic: `tectonic -X bundle search` lists the bundle.
//!
//! When no index can be built, lookups fall back to `kpsewhich`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use super::discovery::{Distribution, DistroKind};
use crate::process;

/// Extensions worth indexing.
const INDEXED: &[&str] = &[
    "sty", "cls", "tex", "def", "cfg", "ldf", "clo", "fd", "bbx", "cbx", "lbx", "dbx", "bst",
    "bib", "pdf", "png", "jpg", "jpeg", "eps",
];

/// Where file contents come from.
#[derive(Debug, Clone)]
enum Reader {
    /// Files on disk.
    Disk,
    /// Tectonic bundle (`tectonic -X bundle cat`).
    Tectonic(PathBuf),
}

/// File index of a distribution.
#[derive(Debug, Clone)]
pub struct TexmfIndex {
    dirs: Vec<PathBuf>,
    files: HashMap<Box<str>, u32>,
    reader: Reader,
    kpsewhich: Option<process::Cmd>,
}

impl Default for TexmfIndex {
    fn default() -> Self {
        Self {
            dirs: Vec::new(),
            files: HashMap::new(),
            reader: Reader::Disk,
            kpsewhich: None,
        }
    }
}

impl TexmfIndex {
    /// Builds the index of `dist` (a few hundred milliseconds; run in background).
    pub fn build(dist: &Distribution) -> Self {
        let mut index = TexmfIndex {
            kpsewhich: dist.tool("kpsewhich").map(|_| dist.cmd("kpsewhich")),
            ..Self::default()
        };
        match dist.kind {
            DistroKind::Tectonic => {
                if let Some(t) = dist.tool("tectonic") {
                    index.reader = Reader::Tectonic(t.to_path_buf());
                    index.load_tectonic(dist);
                }
            }
            DistroKind::MikTex => {
                for root in miktex_roots(dist) {
                    index.walk(&root.join("tex"), 0);
                }
            }
            _ => {
                let mut found = false;
                for ls_r in index.kpse_all("ls-R") {
                    found |= index.load_ls_r(&ls_r);
                }
                if !found {
                    // Guess the tree from the binary location: <root>/bin/<arch>.
                    if let Some(root) = dist.bin_dir.parent().and_then(Path::parent) {
                        for tree in ["texmf-dist", "texmf-local", "texmf"] {
                            index.load_ls_r(&root.join(tree).join("ls-R"));
                        }
                    }
                }
                if let Some(home) = index.kpse_var("TEXMFHOME") {
                    index.walk(&home.join("tex"), 0);
                }
            }
        }
        index
    }

    /// Number of indexed files.
    pub fn len(&self) -> usize {
        self.files.len()
    }

    /// Whether the index is empty (lookups then use `kpsewhich`).
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// Full path of an installed file (`amsmath.sty`).
    pub fn find(&self, name: &str) -> Option<PathBuf> {
        if let Some(&dir) = self.files.get(name) {
            return Some(self.dirs[dir as usize].join(name));
        }
        if self.files.is_empty() {
            return self.kpsewhich(name);
        }
        None
    }

    /// Whether `name` is installed.
    pub fn contains(&self, name: &str) -> bool {
        if self.files.is_empty() {
            return self.kpsewhich(name).is_some();
        }
        self.files.contains_key(name)
    }

    /// Reads an installed file.
    pub fn read(&self, name: &str) -> Option<String> {
        match &self.reader {
            Reader::Disk => {
                let path = self.find(name)?;
                let bytes = std::fs::read(path).ok()?;
                Some(String::from_utf8_lossy(&bytes).into_owned())
            }
            Reader::Tectonic(t) => {
                let cmd = process::Cmd::new(t).args(["-X", "bundle", "cat", name]);
                let out = process::output(&cmd, Duration::from_secs(30)).ok()?;
                out.success().then_some(out.stdout)
            }
        }
    }

    /// Names (without extension) of all installed files with `ext`, sorted.
    pub fn names_with_extension(&self, ext: &str) -> Vec<String> {
        let suffix = format!(".{ext}");
        let mut v: Vec<String> = self
            .files
            .keys()
            .filter_map(|k| k.strip_suffix(suffix.as_str()))
            .map(str::to_owned)
            .collect();
        v.sort_unstable();
        v
    }

    /// All installed packages.
    pub fn packages(&self) -> Vec<String> {
        self.names_with_extension("sty")
    }

    /// All installed classes.
    pub fn classes(&self) -> Vec<String> {
        self.names_with_extension("cls")
    }

    fn insert(&mut self, dir: u32, name: &str) {
        if INDEXED.iter().any(|e| {
            name.len() > e.len()
                && name.ends_with(e)
                && name.as_bytes()[name.len() - e.len() - 1] == b'.'
        }) && !self.files.contains_key(name)
        {
            self.files.insert(name.into(), dir);
        }
    }

    fn add_dir(&mut self, dir: PathBuf) -> u32 {
        self.dirs.push(dir);
        (self.dirs.len() - 1) as u32
    }

    /// Parses an `ls-R` database. Returns whether it existed.
    fn load_ls_r(&mut self, path: &Path) -> bool {
        let Ok(bytes) = std::fs::read(path) else {
            return false;
        };
        let text = String::from_utf8_lossy(&bytes);
        let base = path.parent().unwrap_or(Path::new("/")).to_path_buf();
        let mut current: Option<u32> = None;
        for line in text.lines() {
            if line.is_empty() || line.starts_with('%') {
                continue;
            }
            if let Some(dir) = line.strip_suffix(':') {
                let rel = dir.trim_start_matches("./").trim_start_matches('.');
                // Only TeX input directories matter.
                current = (rel.starts_with("tex") || rel.starts_with("bibtex") || rel.is_empty())
                    .then(|| {
                        self.add_dir(if rel.is_empty() {
                            base.clone()
                        } else {
                            base.join(rel)
                        })
                    });
                continue;
            }
            if let Some(dir) = current {
                self.insert(dir, line);
            }
        }
        true
    }

    fn walk(&mut self, dir: &Path, depth: usize) {
        if depth > 12 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let mut subdirs = Vec::new();
        let mut id = None;
        for entry in rd.filter_map(Result::ok) {
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_dir() {
                subdirs.push(entry.path());
            } else if let Some(name) = entry.file_name().to_str() {
                let dir_id = *id.get_or_insert_with(|| self.add_dir(dir.to_path_buf()));
                self.insert(dir_id, name);
            }
        }
        for sub in subdirs {
            self.walk(&sub, depth + 1);
        }
    }

    fn load_tectonic(&mut self, dist: &Distribution) {
        let Some(t) = dist.tool("tectonic") else {
            return;
        };
        let cmd = process::Cmd::new(t).args(["-X", "bundle", "search"]);
        let Ok(out) = process::output(&cmd, Duration::from_secs(60)) else {
            return;
        };
        if !out.success() {
            return;
        }
        let dir = self.add_dir(PathBuf::new());
        for line in out.stdout.lines() {
            self.insert(dir, line.trim());
        }
    }

    fn kpsewhich(&self, name: &str) -> Option<PathBuf> {
        let cmd = self.kpsewhich.clone()?.arg(name);
        let out = process::output(&cmd, Duration::from_secs(5)).ok()?;
        let line = out.stdout.lines().next()?.trim();
        (!line.is_empty()).then(|| PathBuf::from(line))
    }

    fn kpse_all(&self, name: &str) -> Vec<PathBuf> {
        let Some(cmd) = self.kpsewhich.clone() else {
            return Vec::new();
        };
        let Ok(out) = process::output(&cmd.args(["--all", name]), Duration::from_secs(10)) else {
            return Vec::new();
        };
        out.stdout
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(PathBuf::from)
            .collect()
    }

    fn kpse_var(&self, var: &str) -> Option<PathBuf> {
        let cmd = self.kpsewhich.clone()?.arg(format!("-var-value={var}"));
        let out = process::output(&cmd, Duration::from_secs(5)).ok()?;
        let v = out.stdout.trim();
        (!v.is_empty()).then(|| PathBuf::from(v))
    }
}

/// Installation and user roots of MiKTeX.
fn miktex_roots(dist: &Distribution) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    // <root>/miktex/bin[/x64]
    let mut p = dist.bin_dir.as_path();
    for _ in 0..4 {
        if let Some(parent) = p.parent() {
            p = parent;
            if p.join("tex").is_dir() {
                roots.push(p.to_path_buf());
                break;
            }
        }
    }
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    for base in [env("LOCALAPPDATA"), env("APPDATA")].into_iter().flatten() {
        roots.push(base.join("MiKTeX"));
    }
    if let Some(dirs) = directories::BaseDirs::new() {
        let home = dirs.home_dir();
        roots.push(home.join(".miktex/texmfs/install"));
        roots.push(home.join(".miktex/texmfs/data"));
        roots.push(home.join("Library/Application Support/MiKTeX/texmfs/install"));
    }
    roots.push("/usr/local/share/miktex-texmf".into());
    roots.push("/usr/share/miktex-texmf".into());
    roots.retain(|r| r.join("tex").is_dir());
    roots.dedup();
    roots
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ls_r() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("ls-R"),
            "% ls-R -- filename database.\n\n./:\nls-R\ntex\n\n./tex/latex/amsmath:\namsmath.sty\namsopn.sty\nREADME\n\n./fonts/tfm:\ncmr10.tfm\n",
        )
        .unwrap();
        let mut idx = TexmfIndex::default();
        assert!(idx.load_ls_r(&dir.path().join("ls-R")));
        assert_eq!(
            idx.find("amsmath.sty").unwrap(),
            dir.path().join("tex/latex/amsmath/amsmath.sty")
        );
        assert!(idx.find("cmr10.tfm").is_none());
        assert_eq!(idx.packages(), ["amsmath", "amsopn"]);
    }
}

//! The local history of a project: what its text files were at a few
//! moments, to look back, compare and restore.
//!
//! A moment (a *snapshot*) is the list of the text files of the project with
//! the hash of each; the contents are kept once per hash, compressed. A
//! moment therefore costs what changed since the one before, and nothing
//! when nothing changed. The history lives with the data of the application,
//! not in the project: nothing is added to the folder of the user.
//!
//! It is meant to stay light: moments are taken at most every few minutes
//! (the setting of the user), only sources are kept (no picture, no PDF, no
//! file of the build), and old moments are thinned out: all of the last
//! day, one per hour for a week, then one per day until they are too old.

use std::collections::{BTreeMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Extensions of the files a moment keeps: what the user writes.
const KEPT: &[&str] = &[
    "tex", "bib", "sty", "cls", "tikz", "pgf", "bst", "bbx", "cbx", "def", "cfg", "ltx", "toml",
    "txt", "md",
];
/// A source larger than this is not kept (a data file with a `.txt` name).
const MAX_FILE: u64 = 1_048_576;
/// Folders that hold nothing the user writes.
const SKIPPED_DIRS: &[&str] = &["build", "node_modules", "target", "out"];

const HOUR: u64 = 3_600_000;
const DAY: u64 = 24 * HOUR;

/// A file of a moment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileEntry {
    /// Path in the project, with `/`.
    pub path: String,
    /// Hash of its content.
    pub hash: String,
    /// Size in bytes.
    pub size: u64,
}

/// A moment as it is stored.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Manifest {
    /// Milliseconds since 1970.
    time: u64,
    /// Why it was taken (`build`, `open`, `manual`, `before-restore`).
    reason: String,
    files: Vec<FileEntry>,
}

/// A moment of the history, as it is listed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Moment {
    /// Identifier (its time).
    pub id: String,
    /// Milliseconds since 1970.
    pub time: u64,
    /// Why it was taken.
    pub reason: String,
    /// Number of files it holds.
    pub files: usize,
    /// The files that are not what they were at the moment before (changed,
    /// new, or gone since then).
    pub changed: Vec<String>,
}

/// The history of one project.
#[derive(Debug, Clone)]
pub struct History {
    dir: PathBuf,
}

/// The folder of the history of the project at `root`, under `base`: the
/// name of the project, and a hash of where it is.
pub fn folder(base: &Path, root: &Path) -> PathBuf {
    let hash = hex(&Sha256::digest(root.to_string_lossy().as_bytes())[..6]);
    let name: String = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .take(40)
        .collect();
    base.join(format!("{name}-{hash}"))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// The sources of the project at `root`: path in the project and content.
fn sources(root: &Path) -> Vec<(String, Vec<u8>)> {
    let mut out = Vec::new();
    let walk = ignore::WalkBuilder::new(root)
        .standard_filters(false)
        .hidden(true)
        .filter_entry(|e| {
            !(e.file_type().is_some_and(|t| t.is_dir())
                && SKIPPED_DIRS.contains(&e.file_name().to_string_lossy().as_ref()))
        })
        .build();
    for entry in walk.flatten() {
        let path = entry.path();
        let kept = path
            .extension()
            .is_some_and(|e| KEPT.contains(&e.to_string_lossy().to_lowercase().as_str()));
        if !kept || !entry.file_type().is_some_and(|t| t.is_file()) {
            continue;
        }
        if entry.metadata().map_or(true, |m| m.len() > MAX_FILE) {
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let Ok(bytes) = std::fs::read(path) else {
            continue;
        };
        let rel: Vec<String> = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();
        out.push((rel.join("/"), bytes));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

impl History {
    /// The history kept in `dir` (made when a first moment is taken).
    pub fn at(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn snapshots(&self) -> PathBuf {
        self.dir.join("snapshots")
    }

    fn object(&self, hash: &str) -> PathBuf {
        let (a, b) = hash.split_at(2.min(hash.len()));
        self.dir.join("objects").join(a).join(format!("{b}.gz"))
    }

    /// The times of the moments, oldest first.
    fn times(&self) -> Vec<u64> {
        let mut times: Vec<u64> = std::fs::read_dir(self.snapshots())
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                e.file_name()
                    .to_string_lossy()
                    .strip_suffix(".json")?
                    .parse()
                    .ok()
            })
            .collect();
        times.sort_unstable();
        times
    }

    fn manifest(&self, time: u64) -> Option<Manifest> {
        let text = std::fs::read_to_string(self.snapshots().join(format!("{time}.json"))).ok()?;
        serde_json::from_str(&text).ok()
    }

    /// Time of the last moment, if any.
    pub fn last(&self) -> Option<u64> {
        self.times().last().copied()
    }

    /// Whether a moment is due: none yet, or the last one is older than
    /// `every_minutes`.
    pub fn due(&self, every_minutes: u32, now: u64) -> bool {
        self.last()
            .is_none_or(|last| now.saturating_sub(last) >= u64::from(every_minutes) * 60_000)
    }

    /// Takes a moment of the project at `root`. Nothing is written, and
    /// `None` is returned, when its sources are what they were at the last
    /// moment.
    pub fn snapshot(&self, root: &Path, reason: &str, now: u64) -> std::io::Result<Option<Moment>> {
        let mut files = Vec::new();
        let mut contents = Vec::new();
        for (path, bytes) in sources(root) {
            let hash = hex(&Sha256::digest(&bytes));
            files.push(FileEntry {
                path,
                hash,
                size: bytes.len() as u64,
            });
            contents.push(bytes);
        }
        let times = self.times();
        let previous = times.last().and_then(|&t| self.manifest(t));
        if files.is_empty() || previous.as_ref().is_some_and(|p| p.files == files) {
            return Ok(None);
        }
        for (file, bytes) in files.iter().zip(&contents) {
            let object = self.object(&file.hash);
            if object.exists() {
                continue;
            }
            std::fs::create_dir_all(object.parent().unwrap())?;
            let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            gz.write_all(bytes)?;
            std::fs::write(&object, gz.finish()?)?;
        }
        // A moment has its own millisecond.
        let time = now.max(times.last().map_or(0, |t| t + 1));
        std::fs::create_dir_all(self.snapshots())?;
        let manifest = Manifest {
            time,
            reason: reason.to_owned(),
            files,
        };
        std::fs::write(
            self.snapshots().join(format!("{time}.json")),
            serde_json::to_vec(&manifest).map_err(std::io::Error::other)?,
        )?;
        Ok(Some(moment(&manifest, previous.as_ref())))
    }

    /// The moments, the latest first.
    pub fn list(&self) -> Vec<Moment> {
        let mut out = Vec::new();
        let mut previous: Option<Manifest> = None;
        for time in self.times() {
            let Some(m) = self.manifest(time) else {
                continue;
            };
            out.push(moment(&m, previous.as_ref()));
            previous = Some(m);
        }
        out.reverse();
        out
    }

    /// The files of a moment.
    pub fn files(&self, id: &str) -> Vec<FileEntry> {
        id.parse()
            .ok()
            .and_then(|t| self.manifest(t))
            .map(|m| m.files)
            .unwrap_or_default()
    }

    fn content(&self, hash: &str) -> Option<Vec<u8>> {
        let bytes = std::fs::read(self.object(hash)).ok()?;
        let mut out = Vec::new();
        flate2::read::GzDecoder::new(bytes.as_slice())
            .read_to_end(&mut out)
            .ok()?;
        Some(out)
    }

    /// The text of a file at a moment (`None` when the moment did not have it).
    pub fn read(&self, id: &str, path: &str) -> Option<String> {
        let file = self.files(id).into_iter().find(|f| f.path == path)?;
        Some(String::from_utf8_lossy(&self.content(&file.hash)?).into_owned())
    }

    /// Writes the files of a moment into `dest`, as the project was then
    /// (its sources only). Returns the number of files written.
    pub fn export(&self, id: &str, dest: &Path) -> std::io::Result<usize> {
        let mut written = 0;
        for file in self.files(id) {
            let Some(bytes) = self.content(&file.hash) else {
                continue;
            };
            let to = dest.join(&file.path);
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(to, bytes)?;
            written += 1;
        }
        Ok(written)
    }

    /// Thins out the old moments (all of the last day, one per hour for a
    /// week, then one per day), drops those older than `keep_days`, and
    /// removes the contents no moment uses any more. The latest moment
    /// always stays. Returns the number of moments removed.
    pub fn prune(&self, keep_days: u32, now: u64) -> usize {
        let times = self.times();
        let Some(&latest) = times.last() else {
            return 0;
        };
        let mut seen: HashSet<(u8, u64)> = HashSet::new();
        let mut removed = 0;
        // The latest first: of each hour or day, the last moment stays.
        for &time in times.iter().rev() {
            let age = now.saturating_sub(time);
            let keep = time == latest
                || if age < DAY {
                    true
                } else if age >= u64::from(keep_days) * DAY {
                    false
                } else if age < 7 * DAY {
                    seen.insert((0, time / HOUR))
                } else {
                    seen.insert((1, time / DAY))
                };
            if !keep && std::fs::remove_file(self.snapshots().join(format!("{time}.json"))).is_ok()
            {
                removed += 1;
            }
        }
        if removed > 0 {
            self.collect();
        }
        removed
    }

    /// Removes the contents no moment uses.
    fn collect(&self) {
        let used: HashSet<String> = self
            .times()
            .into_iter()
            .filter_map(|t| self.manifest(t))
            .flat_map(|m| m.files.into_iter().map(|f| f.hash))
            .collect();
        for dir in std::fs::read_dir(self.dir.join("objects"))
            .into_iter()
            .flatten()
            .flatten()
        {
            let prefix = dir.file_name().to_string_lossy().into_owned();
            for object in std::fs::read_dir(dir.path())
                .into_iter()
                .flatten()
                .flatten()
            {
                let name = object.file_name().to_string_lossy().into_owned();
                let hash = format!("{prefix}{}", name.trim_end_matches(".gz"));
                if !used.contains(&hash) {
                    let _ = std::fs::remove_file(object.path());
                }
            }
        }
    }

    /// Size of the history on disk, in bytes.
    pub fn size(&self) -> u64 {
        fn of(dir: &Path) -> u64 {
            std::fs::read_dir(dir)
                .into_iter()
                .flatten()
                .flatten()
                .map(|e| match e.metadata() {
                    Ok(m) if m.is_dir() => of(&e.path()),
                    Ok(m) => m.len(),
                    Err(_) => 0,
                })
                .sum()
        }
        of(&self.dir)
    }

    /// Forgets everything.
    pub fn clear(&self) -> std::io::Result<()> {
        match std::fs::remove_dir_all(&self.dir) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }
}

/// What became of a file since a moment.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    /// Not what it was.
    Changed,
    /// It did not exist then.
    Added,
    /// It existed then, and is gone.
    Removed,
}

/// A file that is not what it was at a moment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    /// Path in the project, with `/`.
    pub path: String,
    /// What became of it.
    pub status: Status,
}

impl History {
    /// The sources of the project at `root` that are not what they were at
    /// the moment `id`.
    pub fn changes_since(&self, id: &str, root: &Path) -> Vec<Change> {
        let then: BTreeMap<String, String> = self
            .files(id)
            .into_iter()
            .map(|f| (f.path, f.hash))
            .collect();
        let now: BTreeMap<String, String> = sources(root)
            .into_iter()
            .map(|(path, bytes)| (path, hex(&Sha256::digest(&bytes))))
            .collect();
        let mut out: Vec<Change> = now
            .iter()
            .filter_map(|(path, hash)| {
                let status = match then.get(path) {
                    Some(h) if h == hash => return None,
                    Some(_) => Status::Changed,
                    None => Status::Added,
                };
                Some(Change {
                    path: path.clone(),
                    status,
                })
            })
            .chain(
                then.keys()
                    .filter(|path| !now.contains_key(*path))
                    .map(|path| Change {
                        path: path.clone(),
                        status: Status::Removed,
                    }),
            )
            .collect();
        out.sort_by(|a, b| a.path.cmp(&b.path));
        out
    }
}

/// What a line of a comparison is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LineKind {
    /// In both texts.
    Same,
    /// Only in the text before.
    Removed,
    /// Only in the text after.
    Added,
}

/// A line of the comparison of two texts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// What it is.
    pub kind: LineKind,
    /// The line, without its end.
    pub text: String,
    /// Its number in the text before (from 1).
    pub before: Option<u32>,
    /// Its number in the text after (from 1).
    pub after: Option<u32>,
}

/// Beyond this many differing lines the two texts are too far apart to be
/// compared finely: what is between their common start and end is given as
/// removed, then added.
const MAX_DISTANCE: usize = 2000;

/// The lines of `before` and `after`, in order, each one common to both,
/// removed or added (the shortest way from one text to the other).
pub fn diff(before: &str, after: &str) -> Vec<DiffLine> {
    let a: Vec<&str> = before.lines().collect();
    let b: Vec<&str> = after.lines().collect();
    let start = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let end = a[start..]
        .iter()
        .rev()
        .zip(b[start..].iter().rev())
        .take_while(|(x, y)| x == y)
        .count();
    let (ma, mb) = (&a[start..a.len() - end], &b[start..b.len() - end]);
    let mut out = Vec::with_capacity(a.len().max(b.len()));
    let (mut i, mut j) = (0u32, 0u32);
    let mut push = |kind: LineKind, text: &str| {
        if kind != LineKind::Added {
            i += 1;
        }
        if kind != LineKind::Removed {
            j += 1;
        }
        out.push(DiffLine {
            kind,
            text: text.to_owned(),
            before: (kind != LineKind::Added).then_some(i),
            after: (kind != LineKind::Removed).then_some(j),
        });
    };
    for line in &a[..start] {
        push(LineKind::Same, line);
    }
    for (kind, line) in shortest_edit(ma, mb) {
        push(kind, line);
    }
    for line in &a[a.len() - end..] {
        push(LineKind::Same, line);
    }
    out
}

/// The shortest list of lines kept, removed and added that turns `a` into
/// `b` (Myers), or everything removed then added when they are too far apart.
fn shortest_edit<'t>(a: &[&'t str], b: &[&'t str]) -> Vec<(LineKind, &'t str)> {
    let (n, m) = (a.len() as isize, b.len() as isize);
    let whole = || {
        a.iter()
            .map(|l| (LineKind::Removed, *l))
            .chain(b.iter().map(|l| (LineKind::Added, *l)))
            .collect()
    };
    if n == 0 || m == 0 {
        return whole();
    }
    // `trace[d]` holds, for each diagonal k = -d, -d+2 … d, how far in `a`
    // a path of d edits reaches.
    let mut trace: Vec<Vec<isize>> = Vec::new();
    let at = |row: &[isize], d: isize, k: isize| row[((k + d) / 2) as usize];
    let mut found = None;
    'search: for d in 0..=(n + m).min(MAX_DISTANCE as isize) {
        let mut row = vec![0isize; d as usize + 1];
        for k in (-d..=d).step_by(2) {
            let mut x = if d == 0 {
                0
            } else {
                let prev = &trace[d as usize - 1];
                if k == -d || (k != d && at(prev, d - 1, k - 1) < at(prev, d - 1, k + 1)) {
                    at(prev, d - 1, k + 1)
                } else {
                    at(prev, d - 1, k - 1) + 1
                }
            };
            let mut y = x - k;
            while x < n && y < m && a[x as usize] == b[y as usize] {
                x += 1;
                y += 1;
            }
            row[((k + d) / 2) as usize] = x;
            if x >= n && y >= m {
                trace.push(row);
                found = Some(d);
                break 'search;
            }
        }
        trace.push(row);
    }
    let Some(distance) = found else {
        return whole();
    };
    // Back from the end to the start, one edit at a time.
    let mut out = Vec::with_capacity((n + m) as usize);
    let (mut x, mut y) = (n, m);
    for d in (1..=distance).rev() {
        let k = x - y;
        let prev = &trace[d as usize - 1];
        let down = k == -d || (k != d && at(prev, d - 1, k - 1) < at(prev, d - 1, k + 1));
        let prev_k = if down { k + 1 } else { k - 1 };
        let prev_x = at(prev, d - 1, prev_k);
        let prev_y = prev_x - prev_k;
        let (edit_x, edit_y) = if down {
            (prev_x, prev_y + 1)
        } else {
            (prev_x + 1, prev_y)
        };
        while x > edit_x && y > edit_y {
            x -= 1;
            y -= 1;
            out.push((LineKind::Same, a[x as usize]));
        }
        if down {
            out.push((LineKind::Added, b[prev_y as usize]));
        } else {
            out.push((LineKind::Removed, a[prev_x as usize]));
        }
        (x, y) = (prev_x, prev_y);
    }
    while x > 0 && y > 0 {
        x -= 1;
        y -= 1;
        out.push((LineKind::Same, a[x as usize]));
    }
    out.reverse();
    out
}

/// A moment as it is listed, with what changed since `previous`.
fn moment(m: &Manifest, previous: Option<&Manifest>) -> Moment {
    let before: BTreeMap<&str, &str> = previous
        .map(|p| {
            p.files
                .iter()
                .map(|f| (f.path.as_str(), f.hash.as_str()))
                .collect()
        })
        .unwrap_or_default();
    let now: BTreeMap<&str, &str> = m
        .files
        .iter()
        .map(|f| (f.path.as_str(), f.hash.as_str()))
        .collect();
    let mut changed: Vec<String> = now
        .iter()
        .filter(|(path, hash)| previous.is_some() && before.get(*path) != Some(*hash))
        .map(|(path, _)| (*path).to_owned())
        .chain(
            before
                .keys()
                .filter(|path| !now.contains_key(*path))
                .map(|p| (*p).to_owned()),
        )
        .collect();
    changed.sort();
    Moment {
        id: m.time.to_string(),
        time: m.time,
        reason: m.reason.clone(),
        files: m.files.len(),
        changed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project() -> (tempfile::TempDir, PathBuf, History) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Mon mémoire");
        std::fs::create_dir_all(root.join("chapitres")).unwrap();
        std::fs::create_dir_all(root.join("build")).unwrap();
        std::fs::write(root.join("main.tex"), "\\documentclass{article}\n").unwrap();
        std::fs::write(root.join("chapitres/intro.tex"), "Bonjour.\n").unwrap();
        std::fs::write(root.join("refs.bib"), "@book{a, title={A}}\n").unwrap();
        // Not sources: a picture, the files of the build.
        std::fs::write(root.join("figure.png"), [0u8, 1, 2]).unwrap();
        std::fs::write(root.join("build/main.tex"), "copy").unwrap();
        let history = History::at(folder(&dir.path().join("history"), &root));
        (dir, root, history)
    }

    #[test]
    fn a_moment_keeps_the_sources_and_costs_what_changed() {
        let (_dir, root, history) = project();
        assert!(history.due(10, 1_000));
        let first = history.snapshot(&root, "open", 1_000).unwrap().unwrap();
        assert_eq!(
            (first.files, first.changed.len(), first.reason.as_str()),
            (3, 0, "open")
        );
        // Nothing changed: no moment.
        assert_eq!(history.snapshot(&root, "build", 2_000).unwrap(), None);
        assert!(!history.due(10, 2_000) && history.due(10, 1_000 + 600_000));

        std::fs::write(root.join("chapitres/intro.tex"), "Bonjour le monde.\n").unwrap();
        std::fs::write(root.join("annexe.tex"), "Annexe.\n").unwrap();
        std::fs::remove_file(root.join("refs.bib")).unwrap();
        let second = history.snapshot(&root, "build", 700_000).unwrap().unwrap();
        assert_eq!(
            second.changed,
            ["annexe.tex", "chapitres/intro.tex", "refs.bib"]
        );

        let list = history.list();
        assert_eq!(
            list.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(),
            ["700000", "1000"]
        );
        assert_eq!(
            history.read("1000", "chapitres/intro.tex").as_deref(),
            Some("Bonjour.\n")
        );
        assert_eq!(
            history.read("700000", "chapitres/intro.tex").as_deref(),
            Some("Bonjour le monde.\n")
        );
        assert_eq!(history.read("700000", "refs.bib"), None);
        assert_eq!(history.read("1000", "figure.png"), None);
        // `main.tex` did not change: its content is kept once.
        let objects = walk(&history.dir.join("objects"));
        assert_eq!(objects, 5, "three sources, then one changed and one new");
    }

    fn walk(dir: &Path) -> usize {
        std::fs::read_dir(dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| {
                if e.path().is_dir() {
                    walk(&e.path())
                } else {
                    1
                }
            })
            .sum()
    }

    #[test]
    fn a_moment_is_written_back_as_the_project_was() {
        let (dir, root, history) = project();
        history.snapshot(&root, "open", 5).unwrap();
        std::fs::write(root.join("main.tex"), "changed").unwrap();
        let out = dir.path().join("then");
        assert_eq!(history.export("5", &out).unwrap(), 3);
        assert_eq!(
            std::fs::read_to_string(out.join("main.tex")).unwrap(),
            "\\documentclass{article}\n"
        );
        assert_eq!(
            std::fs::read_to_string(out.join("chapitres/intro.tex")).unwrap(),
            "Bonjour.\n"
        );
    }

    #[test]
    fn old_moments_are_thinned_out() {
        let (_dir, root, history) = project();
        let now = 400 * DAY;
        let mut n = 0;
        let mut take = |time: u64| {
            n += 1;
            std::fs::write(root.join("main.tex"), format!("version {n}")).unwrap();
            history.snapshot(&root, "build", time).unwrap().unwrap();
        };
        // Too old; three in one day of last month; three in one hour of this
        // week; three in the last day.
        take(now - 200 * DAY);
        for minutes in [0, 10, 20] {
            take(now - 20 * DAY + minutes * 60_000);
        }
        for minutes in [0, 10, 20] {
            take((now - 3 * DAY) / HOUR * HOUR + minutes * 60_000);
        }
        for minutes in [50, 30, 10] {
            take(now - minutes * 60_000);
        }
        assert_eq!(history.list().len(), 10);
        assert_eq!(history.prune(90, now), 5);
        let kept: Vec<String> = history
            .list()
            .iter()
            .map(|m| history.read(&m.id, "main.tex").unwrap())
            .collect();
        assert_eq!(
            kept,
            [
                "version 10",
                "version 9",
                "version 8",
                "version 7",
                "version 4"
            ]
        );
        // What no moment uses is gone, what is used can still be read.
        assert_eq!(walk(&history.dir.join("objects")), 5 + 2);
        assert!(history.size() > 0);
        history.clear().unwrap();
        assert!(history.list().is_empty() && history.size() == 0);
        history.clear().unwrap();
    }

    #[test]
    fn what_changed_since_a_moment() {
        let (_dir, root, history) = project();
        history.snapshot(&root, "open", 9).unwrap();
        assert!(history.changes_since("9", &root).is_empty());
        std::fs::write(root.join("main.tex"), "other").unwrap();
        std::fs::write(root.join("new.tex"), "new").unwrap();
        std::fs::remove_file(root.join("refs.bib")).unwrap();
        let changes: Vec<(String, Status)> = history
            .changes_since("9", &root)
            .into_iter()
            .map(|c| (c.path, c.status))
            .collect();
        assert_eq!(
            changes,
            [
                ("main.tex".to_owned(), Status::Changed),
                ("new.tex".to_owned(), Status::Added),
                ("refs.bib".to_owned(), Status::Removed)
            ]
        );
    }

    /// The comparison as `-removed`, `+added` and ` same` lines.
    fn compared(before: &str, after: &str) -> Vec<String> {
        diff(before, after)
            .into_iter()
            .map(|l| {
                let mark = match l.kind {
                    LineKind::Same => ' ',
                    LineKind::Removed => '-',
                    LineKind::Added => '+',
                };
                format!("{mark}{}", l.text)
            })
            .collect()
    }

    #[test]
    fn two_texts_are_compared_line_by_line() {
        assert_eq!(compared("a\nb\nc\n", "a\nb\nc\n"), [" a", " b", " c"]);
        assert_eq!(compared("a\nb\nc\n", "a\nB\nc\n"), [" a", "-b", "+B", " c"]);
        assert_eq!(compared("a\nc\n", "a\nb\nc\n"), [" a", "+b", " c"]);
        assert_eq!(compared("a\nb\nc\n", "a\nc\n"), [" a", "-b", " c"]);
        assert_eq!(compared("", "a\nb\n"), ["+a", "+b"]);
        assert_eq!(compared("a\nb\n", ""), ["-a", "-b"]);
        assert_eq!(
            compared(
                "one\ntwo\nthree\nfour\nfive\n",
                "zero\none\nthree\nFOUR\nfive\nsix\n"
            ),
            [
                "+zero", " one", "-two", " three", "-four", "+FOUR", " five", "+six"
            ]
        );
        // Line numbers on each side.
        let lines = diff("a\nb\nc\n", "a\nc\nd\n");
        let numbers: Vec<(Option<u32>, Option<u32>)> =
            lines.iter().map(|l| (l.before, l.after)).collect();
        assert_eq!(
            numbers,
            [
                (Some(1), Some(1)),
                (Some(2), None),
                (Some(3), Some(2)),
                (None, Some(3))
            ]
        );
    }

    #[test]
    fn a_comparison_gives_back_both_texts() {
        // Pseudo-random texts: whatever the edits, the lines kept and removed
        // are the text before, those kept and added the text after.
        let mut seed = 12345u32;
        let mut next = move || {
            seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            (seed >> 16) % 7
        };
        for _ in 0..200 {
            let before: Vec<String> = (0..next() * 3).map(|_| format!("l{}", next())).collect();
            let after: Vec<String> = (0..next() * 3).map(|_| format!("l{}", next())).collect();
            let lines = diff(&before.join("\n"), &after.join("\n"));
            let side = |skip: LineKind| -> Vec<String> {
                lines
                    .iter()
                    .filter(|l| l.kind != skip)
                    .map(|l| l.text.clone())
                    .collect()
            };
            assert_eq!(side(LineKind::Added), before);
            assert_eq!(side(LineKind::Removed), after);
        }
        // Too far apart: still both texts, without the fine comparison.
        let before: Vec<String> = (0..3000).map(|i| format!("a{i}")).collect();
        let after: Vec<String> = (0..3000).map(|i| format!("b{i}")).collect();
        let lines = diff(&before.join("\n"), &after.join("\n"));
        assert_eq!(lines.len(), 6000);
        assert!(lines[..3000].iter().all(|l| l.kind == LineKind::Removed));
    }

    #[test]
    fn projects_have_their_own_folder() {
        let base = Path::new("/data/history");
        let a = folder(base, Path::new("/home/u/Documents/Mon mémoire"));
        let b = folder(base, Path::new("/home/u/Autre/Mon mémoire"));
        assert_ne!(a, b);
        assert!(
            a.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("Mon-mémoire-")
        );
    }
}

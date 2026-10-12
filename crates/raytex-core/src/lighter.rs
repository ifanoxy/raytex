//! A lighter PDF: the document built again with lighter copies of its
//! pictures, in a copy of the project made for that build.
//!
//! Nothing of the project is touched. Its files are copied (never linked:
//! a build writes where it reads) into a folder of the cache, with the
//! state of its last build so that one pass is enough, and each PNG or JPEG
//! picture the document embeds is written there lighter, under its own
//! name: the engines tell a picture by what it holds, not by its extension,
//! so that a photograph kept as a PNG can be embedded as a JPEG without a
//! word of the document changing.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::export::{Target, extension, name_under, real, recorded};
use crate::history::CHANGES_JOB;
use crate::images::{self, Compression};

/// A file of the project a build did not read is not copied over this
/// size: what the document needs is in the record of its build.
const UNREAD_LIMIT: u64 = 8 * 1024 * 1024;

/// Lighter copies are forgotten after this many days without a use.
const KEPT_DAYS: u64 = 14;

/// A picture of the document that can be made lighter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Picture {
    /// Its file.
    pub path: PathBuf,
    /// Its size, in bytes.
    pub size: u64,
}

/// The pictures the document embeds that can be made lighter: the PNG and
/// JPEG files of the project its last build read. Empty when no build
/// recorded what it read.
pub fn pictures(t: &Target<'_>) -> Vec<Picture> {
    let Some((read, _)) = recorded(t) else {
        return Vec::new();
    };
    let root = real(t.root_dir);
    let base = real(t.main_dir());
    let out = real(t.out_dir);
    let built_apart = out != base;
    read.into_iter()
        .filter(|path| {
            matches!(extension(path).as_str(), "png" | "jpg" | "jpeg")
                && (path.starts_with(&root) || path.starts_with(&base))
                && !(built_apart && path.starts_with(&out))
        })
        .filter_map(|path| {
            let size = std::fs::metadata(&path).ok().filter(|m| m.is_file())?.len();
            Some(Picture { path, size })
        })
        .collect()
}

/// The lighter copies of pictures, kept from one export to the next: an
/// estimate asks for every weight of every picture, and the export that
/// follows uses one of them.
#[derive(Debug, Clone)]
pub struct Cache {
    dir: PathBuf,
}

impl Cache {
    /// The cache kept in `dir`.
    pub fn at(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    /// Where the copy of `picture` at `how` is kept: named after the file,
    /// its size and its date, so that a picture that changes is made again.
    fn entry(&self, picture: &Path, how: Compression) -> Option<PathBuf> {
        let meta = std::fs::metadata(picture).ok()?;
        let written = meta
            .modified()
            .ok()?
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_nanos();
        let mut hash = Sha256::new();
        hash.update(picture.to_string_lossy().as_bytes());
        hash.update(meta.len().to_le_bytes());
        hash.update(written.to_le_bytes());
        let name: String = hash.finalize()[..12]
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        Some(
            self.dir
                .join(format!("{name}-{}-{}", how.max_side, how.quality)),
        )
    }

    /// Makes the copies of `picture` at each of `steps` that are not kept
    /// yet, reading the picture once. An empty file stands for "nothing to
    /// gain at this weight".
    fn make(&self, picture: &Path, steps: &[Compression]) {
        let missing: Vec<(Compression, PathBuf)> = steps
            .iter()
            .filter_map(|how| Some((*how, self.entry(picture, *how)?)))
            .filter(|(_, entry)| !entry.is_file())
            .collect();
        if missing.is_empty() || std::fs::create_dir_all(&self.dir).is_err() {
            return;
        }
        let read = std::fs::read(picture)
            .ok()
            .and_then(|data| images::Picture::read(&data));
        for (how, entry) in missing {
            let data = read
                .as_ref()
                .and_then(|p| p.compress(how, false))
                .map(|c| c.data)
                .unwrap_or_default();
            // Written whole or not at all: another export may be reading.
            let part = entry.with_extension("part");
            if std::fs::write(&part, data).is_ok() {
                let _ = std::fs::rename(&part, &entry);
            }
        }
    }

    /// The lighter copy of `picture` at `how`; `None` when there is nothing
    /// to gain (the picture is then used as it is).
    pub fn lighter(&self, picture: &Path, how: Compression) -> Option<Vec<u8>> {
        self.make(picture, &[how]);
        let data = std::fs::read(self.entry(picture, how)?).ok()?;
        (!data.is_empty()).then_some(data)
    }

    /// What `picture` weighs at `how`: the size of its lighter copy, its own
    /// when there is nothing to gain.
    fn size(&self, picture: &Picture, how: Compression) -> u64 {
        self.entry(&picture.path, how)
            .and_then(|entry| std::fs::metadata(entry).ok())
            .map(|m| m.len())
            .filter(|len| *len > 0)
            .unwrap_or(picture.size)
    }

    /// Forgets the copies that were not made or used for a while.
    pub fn prune(&self) {
        let Ok(entries) = std::fs::read_dir(&self.dir) else {
            return;
        };
        let old = std::time::Duration::from_secs(KEPT_DAYS * 24 * 3600);
        for entry in entries.flatten() {
            let stale = entry
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|at| at.elapsed().ok())
                .is_some_and(|age| age > old);
            if stale {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

/// What the pictures of a document weigh together: as they are, and at each
/// step of [`Compression::STEPS`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Weights {
    /// How many pictures.
    pub pictures: usize,
    /// Their size as they are, in bytes.
    pub original: u64,
    /// Their size at each step, from the lightest touch to the heaviest.
    pub steps: Vec<u64>,
}

/// Runs `work` on every index below `count`, on a few threads.
fn in_parallel(count: usize, cancel: &AtomicBool, work: &(dyn Fn(usize) + Sync)) {
    let next = AtomicUsize::new(0);
    let threads = std::thread::available_parallelism()
        .map_or(2, |n| n.get())
        .clamp(1, 8)
        .min(count.max(1));
    std::thread::scope(|scope| {
        for _ in 0..threads {
            scope.spawn(|| {
                loop {
                    let i = next.fetch_add(1, Ordering::Relaxed);
                    if i >= count || cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    work(i);
                }
            });
        }
    });
}

/// Weighs `pictures` at every step (their lighter copies are made on the
/// way, and kept). `None` when `cancel` was raised before the end.
pub fn weigh(pictures: &[Picture], cache: &Cache, cancel: &AtomicBool) -> Option<Weights> {
    in_parallel(pictures.len(), cancel, &|i| {
        cache.make(&pictures[i].path, &Compression::STEPS);
    });
    if cancel.load(Ordering::Relaxed) {
        return None;
    }
    Some(Weights {
        pictures: pictures.len(),
        original: pictures.iter().map(|p| p.size).sum(),
        steps: Compression::STEPS
            .iter()
            .map(|how| pictures.iter().map(|p| cache.size(p, *how)).sum())
            .collect(),
    })
}

/// The first step at which a PDF that weighs `pdf` with its pictures as
/// they are would weigh `limit` at most: what the pictures lose is taken off
/// its weight. The heaviest step when none is enough (`false`: the limit is
/// out of reach, the rest of the document is too heavy by itself).
pub fn step_for(weights: &Weights, pdf: u64, limit: u64) -> (usize, bool) {
    let estimate = |step: usize| pdf.saturating_sub(weights.original) + weights.steps[step];
    match (0..weights.steps.len()).find(|step| estimate(*step) <= limit) {
        Some(step) => (step, true),
        None => (weights.steps.len().saturating_sub(1), false),
    }
}

/// A copy of a project made to build it with lighter pictures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mirror {
    /// The folder that holds it all (removed after the export).
    pub dir: PathBuf,
    /// The main file, in the copy.
    pub main: PathBuf,
    /// Where the copy is built: at the same place under the main file as in
    /// the project when the project is built inside itself.
    pub out_dir: PathBuf,
    /// The pictures, where they are in the copy, with the file each one is a
    /// copy of.
    pub pictures: Vec<(PathBuf, PathBuf)>,
}

/// What a build of the main file writes and reads back: the state the copy
/// starts from, so that one pass is enough. Not its PDF nor its logs.
fn state_of_a_build(name: &str, job: &str) -> bool {
    ![".pdf", ".synctex.gz", ".synctex", ".log", ".fls", ".xdv"]
        .iter()
        .any(|ext| name == format!("{job}{ext}"))
}

/// Folders that are not copied: hidden ones, what RayTeX itself builds
/// apart, and those of other tools that hold thousands of files.
fn skipped_dir(name: &str) -> bool {
    name.starts_with('.') || name.starts_with(CHANGES_JOB) || name == "node_modules"
}

fn files_under(dir: &Path, into: &mut Vec<PathBuf>, skip: &dyn Fn(&Path) -> bool) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_dir() {
            if !skipped_dir(&name) && !skip(&path) {
                files_under(&path, into, skip);
            }
        } else if kind.is_file() && !name.starts_with('.') {
            into.push(path);
        }
    }
}

fn copy_to(from: &Path, to: &Path) -> std::io::Result<()> {
    if let Some(dir) = to.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::copy(from, to).map(|_| ())
}

/// Copies the project of `t` into `to` (a folder made for it, emptied
/// first), ready to be built there. `whole`: every file of the project
/// folder is copied (a file opened on its own has no folder of its own:
/// only what its build read is). The pictures are copied as they are:
/// [`lighten`] then writes them lighter.
pub fn mirror(t: &Target<'_>, whole: bool, to: &Path) -> std::io::Result<Mirror> {
    let _ = std::fs::remove_dir_all(to);
    let root = real(t.root_dir);
    let main = real(t.main);
    let base = real(t.main_dir());
    let out = real(t.out_dir);
    let job = t.job();
    let read: BTreeSet<PathBuf> = recorded(t)
        .map(|(files, _)| files.into_iter().collect())
        .unwrap_or_default();
    let src = to.join("src");
    let inside = out.starts_with(&root);
    let built_apart = out != base;
    // Where a file of the project goes in the copy.
    let place = |path: &Path| -> Option<PathBuf> {
        let rel = path.strip_prefix(&root).ok()?;
        Some(src.join(rel))
    };

    let mut sources = Vec::new();
    if whole {
        files_under(&root, &mut sources, &|dir| {
            (built_apart && dir == out) || dir == to
        });
    } else {
        sources.extend(
            read.iter()
                .filter(|p| p.starts_with(&root) && !(built_apart && p.starts_with(&out)))
                .cloned(),
        );
        sources.extend(t.bib_files.iter().map(|b| real(b)));
        sources.push(main.clone());
        sources.sort();
        sources.dedup();
    }
    let mut pictures = Vec::new();
    for path in &sources {
        let Some(copy) = place(path) else { continue };
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        // Built in its own folder, the project holds what its builds left:
        // their state is copied, their PDF is not.
        if !built_apart && path.parent() == Some(base.as_path()) && !state_of_a_build(&name, &job) {
            continue;
        }
        let Ok(meta) = std::fs::metadata(path) else {
            continue;
        };
        if !meta.is_file() || (meta.len() > UNREAD_LIMIT && !read.contains(path)) {
            continue;
        }
        copy_to(path, &copy)?;
        if read.contains(path) && matches!(extension(path).as_str(), "png" | "jpg" | "jpeg") {
            pictures.push((copy, path.clone()));
        }
    }

    // The state of the last build, at the same place when the project is
    // built inside itself (what the document reads from it is found).
    let out_copy = if !built_apart {
        place(&base).unwrap_or_else(|| src.clone())
    } else if inside {
        place(&out).unwrap_or_else(|| to.join("out"))
    } else {
        to.join("out")
    };
    if built_apart {
        let mut state = Vec::new();
        files_under(&out, &mut state, &|_| false);
        for path in state {
            let Some(rel) = name_under(&out, &path) else {
                continue;
            };
            let name = rel.rsplit('/').next().unwrap_or(&rel);
            let at_top = !rel.contains('/');
            if at_top && !state_of_a_build(name, &job) {
                continue;
            }
            copy_to(&path, &out_copy.join(&rel))?;
        }
    }
    std::fs::create_dir_all(&out_copy)?;
    let main_copy = place(&main).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "the main file is not in its project",
        )
    })?;
    Ok(Mirror {
        dir: to.to_path_buf(),
        main: main_copy,
        out_dir: out_copy,
        pictures,
    })
}

/// Writes the pictures of `mirror` at the weight of `how`: each one is its
/// lighter copy, or the picture itself when there is nothing to gain.
/// `progress` is told how many are done out of how many. `false` when
/// `cancel` was raised before the end.
pub fn lighten(
    mirror: &Mirror,
    how: Compression,
    cache: &Cache,
    cancel: &AtomicBool,
    progress: &(dyn Fn(usize, usize) + Sync),
) -> bool {
    let done = AtomicUsize::new(0);
    let total = mirror.pictures.len();
    in_parallel(total, cancel, &|i| {
        let (copy, picture) = &mirror.pictures[i];
        let written = match cache.lighter(picture, how) {
            Some(data) => std::fs::write(copy, data),
            None => std::fs::copy(picture, copy).map(|_| ()),
        };
        if let Err(e) = written {
            tracing::warn!("lighter picture {}: {e}", copy.display());
        }
        progress(done.fetch_add(1, Ordering::Relaxed) + 1, total);
    });
    !cancel.load(Ordering::Relaxed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::log::normalize;

    /// A picture with the grain of a photograph.
    fn photo(width: u32, height: u32, seed: u32) -> Vec<u8> {
        let mut seed = seed | 1;
        let image = image::RgbImage::from_fn(width, height, |x, y| {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let noise = (seed % 24) as u8;
            image::Rgb([
                (x * 200 / width) as u8 + noise,
                (y * 200 / height) as u8 + noise,
                noise * 4,
            ])
        });
        let mut out = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(image)
            .write_to(&mut out, image::ImageFormat::Png)
            .unwrap();
        out.into_inner()
    }

    /// A project built in `build/`, with two photographs its build read, a
    /// picture it did not read, and what a build leaves.
    fn project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = normalize(&dir.path().join("rapport"));
        for sub in ["chapitres", "figures", "build/chapitres", ".git"] {
            std::fs::create_dir_all(root.join(sub)).unwrap();
        }
        let w = |name: &str, data: &[u8]| std::fs::write(root.join(name), data).unwrap();
        w("main.tex", b"\\documentclass{article}\\usepackage{graphicx}\\begin{document}\\include{chapitres/un}\\end{document}\n");
        w(
            "chapitres/un.tex",
            b"\\includegraphics{figures/plage.png}\\includegraphics{figures/ville}\n",
        );
        w("figures/plage.png", &photo(900, 600, 7));
        w("figures/ville.png", &photo(800, 600, 11));
        w("figures/oubliee.png", &photo(200, 100, 3));
        w("figures/schema.pdf", b"%PDF-1.5\n%%EOF\n");
        w("refs.bib", b"@book{a, title={A}}\n");
        w("style.bst", b"ENTRY{}{}{}\n");
        w(".git/config", b"x");
        w("build/main.aux", b"\\relax\n");
        w("build/chapitres/un.aux", b"\\relax\n");
        w(
            "build/main.bbl",
            b"\\begin{thebibliography}{1}\\end{thebibliography}\n",
        );
        w("build/main.pdf", b"%PDF-1.5\nold\n%%EOF\n");
        w("build/main.log", b"log");
        w("build/main.synctex.gz", b"gz");
        let record = format!(
            "PWD {}\nINPUT main.tex\nINPUT ./chapitres/un.tex\nINPUT figures/plage.png\nINPUT ./figures/ville.png\nINPUT figures/schema.pdf\nINPUT build/main.aux\nOUTPUT build/main.pdf\n",
            root.display()
        );
        w("build/main.fls", record.as_bytes());
        (dir, root)
    }

    #[test]
    fn the_pictures_a_build_read_are_weighed_at_every_step() {
        let (dir, root) = project();
        let (main, out, bib) = (
            root.join("main.tex"),
            root.join("build"),
            vec![root.join("refs.bib")],
        );
        let target = Target {
            root_dir: &root,
            main: &main,
            out_dir: &out,
            bib_files: &bib,
        };
        let found = pictures(&target);
        let names: Vec<String> = found
            .iter()
            .map(|p| p.path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        // Not the picture no build read, nor the drawing kept as a PDF.
        assert_eq!(names, ["plage.png", "ville.png"]);

        let cache = Cache::at(dir.path().join("cache"));
        let calm = AtomicBool::new(false);
        let weights = weigh(&found, &cache, &calm).unwrap();
        assert_eq!(weights.pictures, 2);
        assert_eq!(weights.original, found.iter().map(|p| p.size).sum::<u64>());
        assert_eq!(weights.steps.len(), Compression::STEPS.len());
        // Photographs kept as PNG: many times lighter from the first step,
        // and lighter still at each step that makes them smaller.
        assert!(weights.steps[0] * 4 < weights.original, "{weights:?}");
        assert!(
            weights.steps.windows(2).all(|w| w[1] <= w[0]),
            "{weights:?}"
        );
        assert!(weights.steps[7] < weights.steps[0]);
        // Weighed again, nothing is made again: the copies are kept.
        let kept = std::fs::read_dir(dir.path().join("cache")).unwrap().count();
        assert_eq!(kept, 2 * Compression::STEPS.len());
        assert_eq!(weigh(&found, &cache, &calm).unwrap(), weights);
        // Given up on the way: no weights.
        assert_eq!(weigh(&found, &cache, &AtomicBool::new(true)), None);

        // A PDF of 6 MB of which the pictures are what `original` says.
        let pdf = weights.original + 500_000;
        assert_eq!(step_for(&weights, pdf, pdf), (0, true));
        let (step, within) = step_for(&weights, pdf, 500_000 + weights.steps[3]);
        assert!(within && step <= 3 && 500_000 + weights.steps[step] <= 500_000 + weights.steps[3]);
        // The text alone is over the limit: the heaviest step, and it is said.
        assert_eq!(step_for(&weights, pdf, 400_000), (7, false));
    }

    #[test]
    fn a_copy_of_the_project_with_lighter_pictures() {
        let (dir, root) = project();
        let (main, out, bib) = (
            root.join("main.tex"),
            root.join("build"),
            vec![root.join("refs.bib")],
        );
        let target = Target {
            root_dir: &root,
            main: &main,
            out_dir: &out,
            bib_files: &bib,
        };
        let before: Vec<(PathBuf, Vec<u8>)> = [
            "figures/plage.png",
            "figures/ville.png",
            "main.tex",
            "build/main.pdf",
            "build/main.aux",
        ]
        .iter()
        .map(|n| (root.join(n), std::fs::read(root.join(n)).unwrap()))
        .collect();
        let to = dir.path().join("cache").join("export");
        let copy = mirror(&target, true, &to).unwrap();
        let src = to.join("src");
        assert_eq!(copy.main, src.join("main.tex"));
        assert_eq!(copy.out_dir, src.join("build"));
        let has = |name: &str| src.join(name).is_file();
        // Every file of the project, a style no engine reads included…
        for name in [
            "main.tex",
            "chapitres/un.tex",
            "figures/plage.png",
            "figures/ville.png",
            "figures/oubliee.png",
            "figures/schema.pdf",
            "refs.bib",
            "style.bst",
        ] {
            assert!(has(name), "{name}");
        }
        // …the state of its last build, but its PDF and its logs; nothing hidden.
        for name in ["build/main.aux", "build/chapitres/un.aux", "build/main.bbl"] {
            assert!(has(name), "{name}");
        }
        for name in [
            "build/main.pdf",
            "build/main.log",
            "build/main.synctex.gz",
            "build/main.fls",
            ".git/config",
        ] {
            assert!(!has(name), "{name}");
        }
        let mut copied: Vec<String> = copy
            .pictures
            .iter()
            .map(|(c, _)| name_under(&src, c).unwrap())
            .collect();
        copied.sort();
        assert_eq!(copied, ["figures/plage.png", "figures/ville.png"]);

        // Lighter, under their own names: JPEG data in a file named PNG.
        let cache = Cache::at(dir.path().join("cache").join("pictures"));
        let told = std::sync::Mutex::new(Vec::new());
        let done = lighten(
            &copy,
            Compression::LIGHT,
            &cache,
            &AtomicBool::new(false),
            &|n, of| {
                told.lock().unwrap().push((n, of));
            },
        );
        assert!(done);
        let mut told = told.into_inner().unwrap();
        told.sort();
        assert_eq!(told, [(1, 2), (2, 2)]);
        for (lighter, original) in &copy.pictures {
            let data = std::fs::read(lighter).unwrap();
            assert_eq!(
                image::guess_format(&data).unwrap(),
                image::ImageFormat::Jpeg
            );
            assert!(data.len() as u64 * 4 < std::fs::metadata(original).unwrap().len());
        }
        // The picture nobody embeds is as it was, and so is the whole project.
        assert_eq!(
            std::fs::read(src.join("figures/oubliee.png")).unwrap(),
            std::fs::read(root.join("figures/oubliee.png")).unwrap()
        );
        for (path, data) in &before {
            assert_eq!(&std::fs::read(path).unwrap(), data, "{}", path.display());
        }

        // A file opened on its own: only what its build read, and its bibliography.
        let alone = dir.path().join("cache").join("alone");
        let few = mirror(&target, false, &alone).unwrap();
        let there = |name: &str| alone.join("src").join(name).is_file();
        assert!(
            there("main.tex")
                && there("chapitres/un.tex")
                && there("figures/plage.png")
                && there("refs.bib")
                && there("build/main.aux")
        );
        assert!(!there("figures/oubliee.png") && !there("style.bst"));
        assert_eq!(few.pictures.len(), 2);
    }

    /// The engines embed a photograph written as a JPEG under the name of
    /// the PNG it was: the PDF built in the copy is whole, and lighter.
    #[test]
    #[ignore = "needs a TeX distribution"]
    fn the_document_builds_with_its_lighter_pictures() {
        use crate::build::{self, BuildEvent, DocumentFacts, RunContext};
        use crate::settings::{BuildSettings, EngineChoice};
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        for engine in [
            EngineChoice::Pdflatex,
            EngineChoice::Xelatex,
            EngineChoice::Lualatex,
        ] {
            let (dir, root) = project();
            let main = root.join("main.tex");
            std::fs::write(&main, "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nUne plage.\n\n\\includegraphics[width=8cm]{figures/plage.png}\n\n\\includegraphics[width=8cm]{figures/ville}\n\\end{document}\n").unwrap();
            let _ = std::fs::remove_dir_all(root.join("build"));
            let settings = BuildSettings {
                engine,
                out_dir: "build".to_owned(),
                precompile_preamble: false,
                ..BuildSettings::default()
            };
            let facts = DocumentFacts::default();
            let cancel = AtomicBool::new(false);
            let source = |p: &Path| std::fs::read_to_string(p).ok();
            let run = |file: &Path| {
                let plan = build::plan(file, &settings, Some(&dist), &facts, crate::i18n::Lang::En)
                    .unwrap();
                let ctx = RunContext {
                    dist: &dist,
                    settings: &settings,
                    cancel: &cancel,
                    lang: crate::i18n::Lang::En,
                    source: &source,
                    packages: None,
                    background: false,
                };
                build::run(&plan, &ctx, &mut |_: BuildEvent| {})
            };
            let whole = run(&main);
            assert!(whole.success, "{engine:?}: {:?}", whole.diagnostics);
            let heavy = std::fs::metadata(whole.pdf.unwrap()).unwrap().len();

            let out = root.join("build");
            let target = Target {
                root_dir: &root,
                main: &main,
                out_dir: &out,
                bib_files: &[],
            };
            assert_eq!(pictures(&target).len(), 2, "{engine:?}");
            let copy = mirror(&target, true, &dir.path().join("copy")).unwrap();
            let cache = Cache::at(dir.path().join("pictures"));
            assert!(lighten(
                &copy,
                Compression::LIGHT,
                &cache,
                &cancel,
                &|_, _| {}
            ));
            let lighter = run(&copy.main);
            assert!(lighter.success, "{engine:?}: {:?}", lighter.diagnostics);
            let pdf = lighter.pdf.unwrap();
            assert!(
                pdf.starts_with(&copy.out_dir),
                "{engine:?}: {}",
                pdf.display()
            );
            assert!(crate::export::pdf_complete(&pdf));
            let light = std::fs::metadata(&pdf).unwrap().len();
            assert!(light * 3 < heavy, "{engine:?}: {light} of {heavy}");
            // The project was built once, and not touched since.
            assert!(
                !root
                    .join("build")
                    .join("main.pdf")
                    .metadata()
                    .unwrap()
                    .modified()
                    .unwrap()
                    .elapsed()
                    .unwrap()
                    .is_zero()
            );
        }
    }
}

//! Exporting a project as an archive: all of it, without what a build
//! leaves behind, or only what one document needs, as arXiv and journals
//! ask for it.
//!
//! What a document needs is not guessed from its text: the engine says
//! which files it read (`<job>.fls`, written by every build), and the
//! archive holds those of the project, with the compiled bibliography
//! (`.bbl`) under the name of the main file. An export for a submission
//! therefore follows a build; without one, it asks for it.

use std::collections::BTreeSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::build::AUX_EXTENSIONS;
use crate::history::CHANGES_JOB;
use crate::log::normalize;

/// What an export holds and how.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ExportOptions {
    /// Only what the document uses, with its compiled bibliography (else
    /// the whole project).
    pub submission: bool,
    /// Submission: the comments of the `.tex` files are removed (what is
    /// sent to arXiv can be read by everyone).
    pub strip_comments: bool,
    /// Submission: the files the main file `\input`s are written in it.
    pub single_file: bool,
    /// Submission: the `.bib` files too (the `.bbl` is always there).
    pub include_bib: bool,
    /// The PDF of the last build.
    pub include_pdf: bool,
}

/// What a file of an export is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    /// The main file of the document.
    Main,
    /// LaTeX sources: other `.tex` files, classes, packages, styles.
    Source,
    /// `.bib` files.
    Bibliography,
    /// The bibliography as the last build made it (`.bbl`).
    Compiled,
    /// Pictures.
    Picture,
    /// The PDF of the document.
    Pdf,
    /// Anything else (data, code listings, the settings of the project).
    Other,
}

/// A file of an export.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    /// Where it is read.
    pub source: PathBuf,
    /// Its path in the archive, with `/`.
    pub name: String,
    /// Size on disk, in bytes.
    pub size: u64,
    /// What it is.
    pub role: Role,
}

/// What an export will hold.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPlan {
    /// The files, by name.
    pub files: Vec<ExportFile>,
    /// Their size, in bytes.
    pub size: u64,
    /// Submission: a build listed the files the document reads.
    pub recorded: bool,
    /// Submission: a source changed since that build (the list may miss a
    /// file added since).
    pub stale: bool,
}

/// The document an export is made for.
#[derive(Debug, Clone, Copy)]
pub struct Target<'a> {
    /// Folder of the project.
    pub root_dir: &'a Path,
    /// Main file.
    pub main: &'a Path,
    /// Where it is built.
    pub out_dir: &'a Path,
    /// Its `.bib` files.
    pub bib_files: &'a [PathBuf],
}

impl Target<'_> {
    fn job(&self) -> String {
        self.main
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    fn main_dir(&self) -> &Path {
        self.main.parent().unwrap_or(self.root_dir)
    }
}

/// A path as the system itself names it. The same folder can be named in
/// several ways (a short name of Windows, `C:\Users\RUNNER~1`, for
/// `C:\Users\runneradmin`; a link), and the engine records the files it
/// read under the name it was given: paths are compared in this form, or a
/// file of the project would not be seen as one. A file that is gone keeps
/// its name as it is written.
fn real(path: &Path) -> PathBuf {
    dunce::canonicalize(path)
        .map(|p| normalize(&p))
        .unwrap_or_else(|_| normalize(path))
}

fn extension(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn role_of(path: &Path) -> Role {
    match extension(path).as_str() {
        "tex" | "sty" | "cls" | "ltx" | "def" | "cfg" | "clo" | "bst" | "bbx" | "cbx" | "lbx"
        | "tikz" | "pgf" => Role::Source,
        "bib" => Role::Bibliography,
        "bbl" => Role::Compiled,
        "png" | "jpg" | "jpeg" | "pdf" | "eps" | "svg" | "gif" | "webp" => Role::Picture,
        _ => Role::Other,
    }
}

/// Whether a file name is one a build leaves behind.
fn is_aux(name: &str) -> bool {
    AUX_EXTENSIONS
        .iter()
        .any(|e| name.ends_with(&format!(".{e}")))
        || name.ends_with("-eps-converted-to.pdf")
}

/// The path of `path` under `base`, with `/`.
fn name_under(base: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(base).ok()?;
    let parts: Vec<String> = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect();
    (!parts.is_empty()).then(|| parts.join("/"))
}

fn file(source: &Path, name: String, role: Role) -> Option<ExportFile> {
    let meta = std::fs::metadata(source).ok().filter(|m| m.is_file())?;
    Some(ExportFile {
        source: source.to_path_buf(),
        name,
        size: meta.len(),
        role,
    })
}

fn finish(mut files: Vec<ExportFile>, recorded: bool, stale: bool) -> ExportPlan {
    files.sort_by(|a, b| a.name.cmp(&b.name));
    files.dedup_by(|a, b| a.name == b.name);
    ExportPlan {
        size: files.iter().map(|f| f.size).sum(),
        files,
        recorded,
        stale,
    }
}

/// The whole project: every file of its folder, except hidden ones, the
/// folder of the build and what a build leaves next to the sources.
fn plan_project(t: &Target<'_>, opts: &ExportOptions) -> ExportPlan {
    let root = real(t.root_dir);
    let out = real(t.out_dir);
    let main = real(t.main);
    let built_apart = out != root && out.starts_with(&root);
    let mut files = Vec::new();
    let walk = ignore::WalkBuilder::new(&root)
        .standard_filters(false)
        .hidden(true)
        .build();
    for entry in walk.flatten() {
        let path = real(entry.path());
        if !entry.file_type().is_some_and(|ft| ft.is_file())
            || (built_apart && path.starts_with(&out))
        {
            continue;
        }
        let Some(name) = name_under(&root, &path) else {
            continue;
        };
        let base = name.rsplit('/').next().unwrap_or(&name);
        if is_aux(base) || base.starts_with(CHANGES_JOB) {
            continue;
        }
        let role = if path == main {
            Role::Main
        } else {
            role_of(&path)
        };
        files.extend(file(&path, name, role));
    }
    if opts.include_pdf {
        let pdf = out.join(format!("{}.pdf", t.job()));
        files.extend(file(&pdf, format!("{}.pdf", t.job()), Role::Pdf));
    }
    finish(files, true, false)
}

/// Whether two paths name the same file, however each of them is written.
pub fn same_file(a: &Path, b: &Path) -> bool {
    real(a) == real(b)
}

/// Adds the files a record (`.fls`) lists as read to `seen`. `pwd` is where
/// the engine ran, unless the record says it.
fn read_record(fls: &Path, pwd: &Path, seen: &mut BTreeSet<PathBuf>) -> Option<()> {
    let text = String::from_utf8_lossy(&std::fs::read(fls).ok()?).into_owned();
    let mut pwd = pwd.to_path_buf();
    for line in text.lines() {
        if let Some(dir) = line.strip_prefix("PWD ") {
            pwd = PathBuf::from(dir.trim());
        } else if let Some(read) = line.strip_prefix("INPUT ") {
            let read = Path::new(read.trim());
            seen.insert(real(&if read.is_absolute() {
                read.to_path_buf()
            } else {
                pwd.join(read)
            }));
        }
    }
    Some(())
}

/// The files a build read, from its `.fls` file: `(files, time of the
/// record)`; `None` when no build left one. A pass that used a precompiled
/// preamble read the format in place of what the preamble reads: the record
/// of that format, kept next to it, is read too.
fn recorded(t: &Target<'_>) -> Option<(Vec<PathBuf>, SystemTime)> {
    let job = t.job();
    let fls = [t.out_dir, t.main_dir()]
        .into_iter()
        .map(|dir| dir.join(format!("{job}.fls")))
        .find(|p| p.is_file())?;
    let at = std::fs::metadata(&fls).and_then(|m| m.modified()).ok()?;
    let mut seen = BTreeSet::new();
    read_record(&fls, t.main_dir(), &mut seen)?;
    let formats: Vec<PathBuf> = seen
        .iter()
        .filter(|p| extension(p) == "fmt")
        .map(|p| p.with_extension("fls"))
        .filter(|p| p.is_file())
        .collect();
    for record in formats {
        read_record(&record, t.main_dir(), &mut seen);
    }
    Some((seen.into_iter().collect(), at))
}

/// What one document needs: the files of the project its last build read,
/// its compiled bibliography, and its `.bib` files when asked.
fn plan_submission(t: &Target<'_>, opts: &ExportOptions) -> ExportPlan {
    let Some((read, at)) = recorded(t) else {
        return finish(Vec::new(), false, true);
    };
    let root = real(t.root_dir);
    let base = real(t.main_dir());
    let out = real(t.out_dir);
    let main = real(t.main);
    let job = t.job();
    let built_apart = out != base;
    let mut files = Vec::new();
    // At its place under the main file; a file of the project that is not
    // under it, by its name.
    let add = |files: &mut Vec<ExportFile>, path: &Path, role: Role| {
        let name = name_under(&base, path)
            .or_else(|| path.file_name().map(|n| n.to_string_lossy().into_owned()));
        if let Some(name) = name {
            files.extend(file(path, name, role));
        }
    };
    for path in &read {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        if *path == out.join(format!("{job}.bbl")) || *path == base.join(format!("{job}.bbl")) {
            files.extend(file(path, format!("{job}.bbl"), Role::Compiled));
            continue;
        }
        // A picture converted by the build: its original is what is sent.
        if let Some(stem) = name.strip_suffix("-eps-converted-to.pdf") {
            let original = path.with_file_name(format!("{stem}.eps"));
            let original = if original.is_file() {
                original
            } else {
                // Converted into the folder of the build: the original is
                // at the same place under the main file.
                name_under(&out, &original)
                    .map(|rel| base.join(rel))
                    .unwrap_or(original)
            };
            if original.starts_with(&root) && original.is_file() {
                add(&mut files, &original, Role::Picture);
            }
            continue;
        }
        if !path.starts_with(&root) || (built_apart && path.starts_with(&out)) || is_aux(&name) {
            continue;
        }
        let role = if *path == main {
            Role::Main
        } else {
            role_of(path)
        };
        add(&mut files, path, role);
    }
    if opts.include_bib {
        for bib in t.bib_files {
            add(&mut files, &real(bib), Role::Bibliography);
        }
    }
    if opts.single_file
        && let Ok(text) = std::fs::read_to_string(&main)
    {
        let mut folded = BTreeSet::new();
        expand(&text, &base, &mut folded, 0);
        files.retain(|f| !folded.contains(&f.source));
    }
    if opts.include_pdf {
        files.extend(file(
            &out.join(format!("{job}.pdf")),
            format!("{job}.pdf"),
            Role::Pdf,
        ));
    }
    // A source written after the build: the list may be that of an older text.
    let stale = files
        .iter()
        .filter(|f| matches!(f.role, Role::Main | Role::Source | Role::Bibliography))
        .any(|f| {
            std::fs::metadata(&f.source)
                .and_then(|m| m.modified())
                .is_ok_and(|m| m > at)
        });
    finish(files, true, stale)
}

/// Whether a PDF is whole. An engine writes its PDF as it goes: read while
/// a build runs, or left by a build that was stopped, the file has a start
/// and no end, and no reader opens it.
pub fn pdf_complete(path: &Path) -> bool {
    use std::io::{Read, Seek, SeekFrom};
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut head = [0u8; 5];
    if file.read_exact(&mut head).is_err() || &head != b"%PDF-" {
        return false;
    }
    let Ok(len) = file.seek(SeekFrom::End(0)) else {
        return false;
    };
    let tail = len.min(1024);
    if file.seek(SeekFrom::Start(len - tail)).is_err() {
        return false;
    }
    let mut end = Vec::with_capacity(tail as usize);
    file.read_to_end(&mut end).is_ok() && end.windows(5).any(|w| w == b"%%EOF")
}

/// Whether the PDF of `t` is that of its files as they are now: it is whole,
/// its build recorded what it read, and none of those files of the project,
/// nor its `.bib` files, was written since.
pub fn pdf_fresh(t: &Target<'_>) -> bool {
    let pdf = t.out_dir.join(format!("{}.pdf", t.job()));
    if !pdf_complete(&pdf) {
        return false;
    }
    let Some((read, at)) = recorded(t) else {
        return false;
    };
    let root = real(t.root_dir);
    let out = real(t.out_dir);
    let built_apart = out != real(t.main_dir());
    let newer = |path: &Path| {
        std::fs::metadata(path)
            .and_then(|m| m.modified())
            .is_ok_and(|m| m > at)
    };
    let source = |path: &&PathBuf| {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        path.starts_with(&root) && !(built_apart && path.starts_with(&out)) && !is_aux(&name)
    };
    !newer(t.main)
        && !read.iter().filter(source).any(|p| newer(p))
        && !t.bib_files.iter().any(|b| newer(b))
}

/// Copies a PDF where the user wants it, whole or not at all: it is refused
/// when it has no end, and written next to its destination first, so that a
/// copy that fails leaves nothing that looks like a document.
pub fn copy_pdf(from: &Path, to: &Path) -> std::io::Result<u64> {
    if !pdf_complete(from) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "incomplete",
        ));
    }
    let name = to
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let part = to.with_file_name(format!(".{name}.raytex-part"));
    let copied = std::fs::copy(from, &part).and_then(|n| {
        std::fs::rename(&part, to)?;
        Ok(n)
    });
    if copied.is_err() {
        let _ = std::fs::remove_file(&part);
    }
    copied
}

/// What an export of `t` will hold.
pub fn plan(t: &Target<'_>, opts: &ExportOptions) -> ExportPlan {
    if opts.submission {
        plan_submission(t, opts)
    } else {
        plan_project(t, opts)
    }
}

/// Environments whose content is not LaTeX: a `%` there is a character.
const VERBATIM: &[&str] = &[
    "verbatim",
    "verbatim*",
    "Verbatim",
    "lstlisting",
    "minted",
    "filecontents",
    "filecontents*",
    "comment",
];
/// Commands whose argument is taken as it is written (`%20` in an address).
const LITERAL: &[&str] = &["\\url", "\\href", "\\path", "\\nolinkurl", "\\lstinline"];

/// Where the comment of a line of LaTeX starts, if it has one.
fn comment_start(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => {
                let rest = &line[i..];
                if let Some(after) = rest.strip_prefix("\\verb") {
                    // `\verb|…|`: up to the same character again.
                    let after = after.strip_prefix('*').unwrap_or(after);
                    if let Some(delim) = after.chars().next().filter(|c| !c.is_alphabetic()) {
                        let start = line.len() - after.len() + delim.len_utf8();
                        // An unclosed `\verb`: the rest of the line is its text.
                        let end = line[start..].find(delim)?;
                        i = start + end + delim.len_utf8();
                        continue;
                    }
                }
                if let Some(cmd) = LITERAL.iter().find(|c| {
                    rest.starts_with(**c)
                        && !rest[c.len()..].starts_with(|ch: char| ch.is_ascii_alphabetic())
                }) {
                    // Its braces, balanced.
                    let mut j = i + cmd.len();
                    let mut depth = 0usize;
                    while j < bytes.len() {
                        match bytes[j] {
                            b'\\' => j += 1,
                            b'{' => depth += 1,
                            b'}' => {
                                depth = depth.saturating_sub(1);
                                if depth == 0 {
                                    break;
                                }
                            }
                            b'%' if depth == 0 => break,
                            _ => {}
                        }
                        j += 1;
                    }
                    if j < bytes.len() && bytes[j] == b'}' {
                        i = j + 1;
                        continue;
                    }
                }
                // `\%`, `\\`: the next character is not what it looks like.
                i += 2;
            }
            b'%' => return Some(i),
            _ => i += 1,
        }
    }
    None
}

/// The text without its comments. A line that is only a comment goes away
/// (TeX reads nothing of it, not even its end); a comment at the end of a
/// line leaves its `%`, which is what keeps the end of that line from being
/// a space. Verbatim text is kept as it is, and so are the lines TeX
/// programs read for themselves (`%&format`, `% !TEX`).
pub fn strip_comments(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut verbatim: Option<&str> = None;
    for line in text.split_inclusive('\n') {
        let (body, end) = match line.strip_suffix('\n') {
            Some(b) => (
                b.strip_suffix('\r').unwrap_or(b),
                &line[b.strip_suffix('\r').unwrap_or(b).len()..],
            ),
            None => (line, ""),
        };
        if let Some(env) = verbatim {
            if body.contains(&format!("\\end{{{env}}}")) {
                verbatim = None;
            }
            out.push_str(line);
            continue;
        }
        let trimmed = body.trim_start();
        if trimmed.starts_with("%&") || trimmed.to_lowercase().replace(' ', "").starts_with("%!tex")
        {
            out.push_str(line);
            continue;
        }
        match comment_start(body) {
            Some(at) if body[..at].trim().is_empty() => {}
            Some(at) => {
                out.push_str(&body[..at]);
                out.push('%');
                out.push_str(end);
            }
            None => out.push_str(line),
        }
        let code = &body[..comment_start(body).unwrap_or(body.len())];
        verbatim = VERBATIM.iter().copied().find(|env| {
            code.rfind(&format!("\\begin{{{env}}}"))
                .is_some_and(|open| !code[open..].contains(&format!("\\end{{{env}}}")))
        });
    }
    out
}

/// `text` with the files it `\input`s and `\include`s written in their
/// place (those found under `dir`, and what they read in turn). The files
/// folded in are added to `folded`.
pub fn expand(text: &str, dir: &Path, folded: &mut BTreeSet<PathBuf>, depth: usize) -> String {
    let mut out = String::with_capacity(text.len());
    let mut verbatim: Option<&str> = None;
    for line in text.split_inclusive('\n') {
        if let Some(env) = verbatim {
            if line.contains(&format!("\\end{{{env}}}")) {
                verbatim = None;
            }
            out.push_str(line);
            continue;
        }
        let code_end = comment_start(line.trim_end_matches(['\n', '\r'])).unwrap_or(line.len());
        let mut rest = 0;
        let mut search = 0;
        while let Some(found) = line[search..code_end].find("\\in") {
            let at = search + found;
            search = at + 3;
            let Some((command, after)) = ["\\input", "\\include"]
                .into_iter()
                .find_map(|c| line[at..code_end].strip_prefix(c).map(|after| (c, after)))
                .filter(|(_, after)| after.trim_start().starts_with('{'))
            else {
                continue;
            };
            let Some(close) = after.find('}') else {
                continue;
            };
            let open = after.find('{').unwrap_or(0);
            let name = after[open + 1..close].trim();
            let candidates = [dir.join(name), dir.join(format!("{name}.tex"))];
            let Some(path) = candidates.iter().find(|p| p.is_file()).map(|p| real(p)) else {
                continue;
            };
            if depth >= 20 || folded.contains(&path) {
                continue;
            }
            let Ok(inner) = std::fs::read_to_string(&path) else {
                continue;
            };
            folded.insert(path);
            let inner = expand(&inner, dir, folded, depth + 1);
            out.push_str(&line[rest..at]);
            // `\include` starts and ends on a new page.
            let page = if command == "\\include" {
                "\\clearpage\n"
            } else {
                ""
            };
            out.push_str(page);
            out.push_str(inner.trim_end_matches('\n'));
            // What follows on the line is not glued to the last word of the file.
            out.push('\n');
            out.push_str(page);
            rest = at + command.len() + close + 1;
            search = rest;
        }
        // A line that held only the command leaves no empty line behind.
        let tail = &line[rest..];
        if rest == 0 || !tail.trim().is_empty() {
            out.push_str(tail);
        }
        let code = &line[..code_end];
        verbatim = VERBATIM.iter().copied().find(|env| {
            code.rfind(&format!("\\begin{{{env}}}"))
                .is_some_and(|open| !code[open..].contains(&format!("\\end{{{env}}}")))
        });
    }
    out
}

/// Writes the archive of `plan` at `dest` (a `.zip` file). Returns its size.
pub fn write(
    plan: &ExportPlan,
    t: &Target<'_>,
    opts: &ExportOptions,
    dest: &Path,
) -> std::io::Result<u64> {
    let zip_error = |e: zip::result::ZipError| std::io::Error::other(e.to_string());
    let base = real(t.main_dir());
    let mut zip = zip::ZipWriter::new(std::fs::File::create(dest)?);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for f in &plan.files {
        let mut bytes = std::fs::read(&f.source)?;
        let is_tex = extension(&f.source) == "tex";
        if opts.submission
            && is_tex
            && (opts.strip_comments || (opts.single_file && f.role == Role::Main))
            && let Ok(mut text) = String::from_utf8(bytes.clone())
        {
            if opts.single_file && f.role == Role::Main {
                text = expand(&text, &base, &mut BTreeSet::new(), 0);
            }
            if opts.strip_comments {
                text = strip_comments(&text);
            }
            bytes = text.into_bytes();
        }
        zip.start_file(f.name.as_str(), options)
            .map_err(zip_error)?;
        zip.write_all(&bytes)?;
    }
    let file = zip.finish().map_err(zip_error)?;
    file.sync_all()?;
    Ok(file.metadata()?.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comments_are_removed_and_nothing_else() {
        let text = "% !TEX program = lualatex\n\\documentclass{article} % la classe\n% une ligne de commentaire\n\\begin{document}\n50~\\% du total % pas tout\nUn mot% collé\nsuite \\url{https://a.b/c%20d} % adresse\n\\verb|100%| reste % fin\n\\\\% après un saut\n\\begin{verbatim}\n% gardé tel quel\n\\end{verbatim}\n  % indenté\nFin.\n\\end{document}\n";
        assert_eq!(
            strip_comments(text),
            "% !TEX program = lualatex\n\\documentclass{article} %\n\\begin{document}\n50~\\% du total %\nUn mot%\nsuite \\url{https://a.b/c%20d} %\n\\verb|100%| reste %\n\\\\%\n\\begin{verbatim}\n% gardé tel quel\n\\end{verbatim}\nFin.\n\\end{document}\n"
        );
        // Windows line ends are kept; a text without comment is untouched.
        assert_eq!(strip_comments("a % b\r\nc\r\n"), "a %\r\nc\r\n");
        let plain = "\\section{Titre}\n\nTexte avec 10\\,\\% de marge.\n";
        assert_eq!(strip_comments(plain), plain);
    }

    #[test]
    fn a_pdf_cut_short_is_not_copied() {
        let dir = tempfile::tempdir().unwrap();
        let whole = dir.path().join("whole.pdf");
        let cut = dir.path().join("cut.pdf");
        let body = format!("%PDF-1.5\n{}\nstartxref\n123\n%%EOF\n", "x".repeat(5000));
        std::fs::write(&whole, &body).unwrap();
        // As an engine leaves it in the middle of a build.
        std::fs::write(&cut, &body[..3000]).unwrap();
        std::fs::write(dir.path().join("text.pdf"), "not a PDF %%EOF").unwrap();
        assert!(pdf_complete(&whole));
        assert!(!pdf_complete(&cut));
        assert!(!pdf_complete(&dir.path().join("text.pdf")));
        assert!(!pdf_complete(&dir.path().join("missing.pdf")));

        let dest = dir.path().join("out").join("copie.pdf");
        std::fs::create_dir_all(dest.parent().unwrap()).unwrap();
        assert_eq!(copy_pdf(&whole, &dest).unwrap(), body.len() as u64);
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), body);
        // Refused, the copy leaves the document that was there, and nothing else.
        let err = copy_pdf(&cut, &dest).unwrap_err();
        assert_eq!(err.to_string(), "incomplete");
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), body);
        assert_eq!(
            std::fs::read_dir(dest.parent().unwrap()).unwrap().count(),
            1
        );
    }

    #[test]
    fn a_pdf_is_fresh_until_one_of_its_files_is_written() {
        let (_dir, root) = project();
        let main = root.join("main.tex");
        let out = root.join("build");
        let bib = vec![root.join("refs.bib")];
        let target = Target {
            root_dir: &root,
            main: &main,
            out_dir: &out,
            bib_files: &bib,
        };
        // No PDF, then a PDF without the record of its build.
        assert!(!pdf_fresh(&target));
        std::fs::write(out.join("main.pdf"), "%PDF-1.5\n%%EOF\n").unwrap();
        assert!(!pdf_fresh(&target));
        let record = format!(
            "PWD {}\nINPUT main.tex\nINPUT ./chapitres/intro.tex\nINPUT figures/courbe.png\nINPUT build/main.aux\nOUTPUT build/main.pdf\n",
            root.display()
        );
        std::fs::write(out.join("main.fls"), record).unwrap();
        assert!(pdf_fresh(&target));
        // What the build itself writes does not make its PDF old.
        let later = SystemTime::now() + std::time::Duration::from_secs(5);
        let touch = |name: &str| {
            let file = std::fs::File::options()
                .write(true)
                .open(root.join(name))
                .unwrap();
            file.set_modified(later).unwrap();
        };
        std::fs::write(out.join("main.aux"), "\\relax").unwrap();
        touch("build/main.aux");
        touch("chapitres/brouillon.tex");
        assert!(pdf_fresh(&target));
        // A picture, a source or the bibliography written since: it is.
        for name in ["figures/courbe.png", "chapitres/intro.tex", "refs.bib"] {
            let before = std::fs::metadata(root.join(name))
                .unwrap()
                .modified()
                .unwrap();
            touch(name);
            assert!(!pdf_fresh(&target), "{name}");
            let file = std::fs::File::options()
                .write(true)
                .open(root.join(name))
                .unwrap();
            file.set_modified(before).unwrap();
            assert!(pdf_fresh(&target), "{name} back");
        }
        // A PDF being written is not fresh, whatever the dates.
        std::fs::write(out.join("main.pdf"), "%PDF-1.5\nhalf").unwrap();
        assert!(!pdf_fresh(&target));
    }

    fn project() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = normalize(&dir.path().join("these"));
        for sub in ["chapitres", "figures", "build/chapitres", ".git"] {
            std::fs::create_dir_all(root.join(sub)).unwrap();
        }
        let w = |name: &str, text: &str| std::fs::write(root.join(name), text).unwrap();
        w(
            "main.tex",
            "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\n\\input{chapitres/intro} % le début\n\\include{chapitres/fin}\n\\bibliography{refs}\n\\end{document}\n",
        );
        w(
            "chapitres/intro.tex",
            "Bonjour. % à revoir\n\\includegraphics{figures/courbe}\n",
        );
        w("chapitres/fin.tex", "Fin.\n");
        w("chapitres/brouillon.tex", "Pas dans le document.\n");
        w("figures/courbe.png", "PNG");
        w("figures/inutile.png", "PNG");
        w("refs.bib", "@book{a, title={A}}\n");
        w("raytex.toml", "[project]\nmain = \"main.tex\"\n");
        w("notes.txt", "à faire\n");
        w(".git/config", "x");
        w("main.aux", "stray");
        w("build/main.aux", "\\relax");
        w(
            "build/main.bbl",
            "\\begin{thebibliography}{1}\\end{thebibliography}\n",
        );
        w("build/main.pdf", "%PDF");
        w("build/chapitres/fin.aux", "\\relax");
        (dir, root)
    }

    fn names(plan: &ExportPlan) -> Vec<&str> {
        plan.files.iter().map(|f| f.name.as_str()).collect()
    }

    #[test]
    fn the_whole_project_without_what_a_build_leaves() {
        let (_dir, root) = project();
        let t = Target {
            root_dir: &root,
            main: &root.join("main.tex"),
            out_dir: &root.join("build"),
            bib_files: &[],
        };
        let plan = plan(&t, &ExportOptions::default());
        assert_eq!(
            names(&plan),
            [
                "chapitres/brouillon.tex",
                "chapitres/fin.tex",
                "chapitres/intro.tex",
                "figures/courbe.png",
                "figures/inutile.png",
                "main.tex",
                "notes.txt",
                "raytex.toml",
                "refs.bib"
            ]
        );
        assert_eq!(plan.files[5].role, Role::Main);
        assert!(plan.recorded && !plan.stale && plan.size > 0);
        let with_pdf = super::plan(
            &t,
            &ExportOptions {
                include_pdf: true,
                ..Default::default()
            },
        );
        assert!(names(&with_pdf).contains(&"main.pdf"));
    }

    /// The record a build of the project above leaves.
    fn record(root: &Path) {
        let fls = format!(
            "PWD {}\nINPUT /usr/local/texlive/texmf-dist/tex/latex/base/article.cls\nINPUT main.tex\nINPUT ./main.tex\nINPUT build/main.aux\nINPUT chapitres/intro.tex\nINPUT {}\nINPUT chapitres/fin.tex\nINPUT build/main.bbl\nOUTPUT build/main.pdf\n",
            root.display(),
            root.join("figures/courbe.png").display()
        );
        std::fs::write(root.join("build/main.fls"), fls).unwrap();
    }

    #[test]
    fn a_submission_holds_what_the_document_read() {
        let (_dir, root) = project();
        let bib = [root.join("refs.bib")];
        let t = Target {
            root_dir: &root,
            main: &root.join("main.tex"),
            out_dir: &root.join("build"),
            bib_files: &bib,
        };
        let submission = |change: &dyn Fn(&mut ExportOptions)| {
            let mut o = ExportOptions {
                submission: true,
                ..Default::default()
            };
            change(&mut o);
            o
        };
        // Never built: nothing is known of what it reads.
        let unknown = plan(&t, &submission(&|_| {}));
        assert!(!unknown.recorded && unknown.files.is_empty());

        record(&root);
        let plain = plan(&t, &submission(&|_| {}));
        assert_eq!(
            names(&plain),
            [
                "chapitres/fin.tex",
                "chapitres/intro.tex",
                "figures/courbe.png",
                "main.bbl",
                "main.tex"
            ]
        );
        assert!(plain.recorded && !plain.stale);
        assert_eq!(plain.files[3].role, Role::Compiled);
        let with_bib = plan(&t, &submission(&|o| o.include_bib = true));
        assert!(names(&with_bib).contains(&"refs.bib"));
        // In one file: the chapters are no longer files of their own.
        let single = submission(&|o| {
            o.single_file = true;
            o.strip_comments = true;
        });
        let folded = plan(&t, &single);
        assert_eq!(
            names(&folded),
            ["figures/courbe.png", "main.bbl", "main.tex"]
        );

        let dest = root.join("envoi.zip");
        assert!(write(&folded, &t, &single, &dest).unwrap() > 0);
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&dest).unwrap()).unwrap();
        let mut listed: Vec<String> = zip.file_names().map(str::to_owned).collect();
        listed.sort();
        assert_eq!(listed, ["figures/courbe.png", "main.bbl", "main.tex"]);
        let mut main = String::new();
        std::io::Read::read_to_string(&mut zip.by_name("main.tex").unwrap(), &mut main).unwrap();
        assert_eq!(
            main,
            "\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nBonjour. %\n\\includegraphics{figures/courbe}\n\\clearpage\nFin.\n\\clearpage\n\\bibliography{refs}\n\\end{document}\n"
        );

        // A source written after the build: the list is that of an older text.
        let later = SystemTime::now() + std::time::Duration::from_secs(5);
        std::fs::File::options()
            .write(true)
            .open(root.join("chapitres/intro.tex"))
            .unwrap()
            .set_modified(later)
            .unwrap();
        assert!(plan(&t, &submission(&|_| {})).stale);
    }

    /// The folder of the project named two ways (here through a link; on
    /// Windows, a short name): the files the build read are still its files.
    #[cfg(unix)]
    #[test]
    fn a_project_named_two_ways_is_one_project() {
        let (dir, root) = project();
        record(&root);
        let link = dir.path().join("lien");
        std::os::unix::fs::symlink(&root, &link).unwrap();
        let bib = [link.join("refs.bib")];
        // The project is known by its link, the build ran in the folder itself.
        let t = Target {
            root_dir: &link,
            main: &link.join("main.tex"),
            out_dir: &link.join("build"),
            bib_files: &bib,
        };
        let opts = ExportOptions {
            submission: true,
            include_bib: true,
            ..Default::default()
        };
        assert_eq!(
            names(&plan(&t, &opts)),
            [
                "chapitres/fin.tex",
                "chapitres/intro.tex",
                "figures/courbe.png",
                "main.bbl",
                "main.tex",
                "refs.bib"
            ]
        );
        // And the other way round: known by its folder, recorded through the link.
        let fls = std::fs::read_to_string(root.join("build/main.fls"))
            .unwrap()
            .replace(&root.display().to_string(), &link.display().to_string());
        std::fs::write(root.join("build/main.fls"), fls).unwrap();
        let bib = [root.join("refs.bib")];
        let t = Target {
            root_dir: &root,
            main: &root.join("main.tex"),
            out_dir: &root.join("build"),
            bib_files: &bib,
        };
        assert_eq!(names(&plan(&t, &opts)).len(), 6);
        let whole = plan(&t, &ExportOptions::default());
        assert_eq!(
            whole.files.iter().filter(|f| f.role == Role::Main).count(),
            1
        );
    }

    /// A 1 × 1 PNG.
    const PIXEL: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
        0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8,
        0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB0, 0x00, 0x00, 0x00,
        0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    /// A real build says what the document reads: its chapters, its
    /// picture, its bibliography once compiled, and nothing of the
    /// distribution or of the folder of the build
    /// (`cargo test -p raytex-core --lib export -- --ignored`).
    #[test]
    #[ignore = "needs a TeX distribution"]
    fn a_built_document_tells_what_it_reads() {
        use crate::build::{self, BuildEvent, DocumentFacts, RunContext};
        use crate::settings::BuildSettings;
        use crate::workspace::Workspace;
        let Some(dist) = crate::tex::detect(&[]).into_iter().next() else {
            println!("no TeX distribution: nothing checked");
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let root = normalize(&dunce::canonicalize(dir.path()).unwrap().join("Mon article"));
        std::fs::create_dir_all(root.join("sections")).unwrap();
        std::fs::create_dir_all(root.join("figures")).unwrap();
        let w = |name: &str, text: &str| std::fs::write(root.join(name), text).unwrap();
        w(
            "main.tex",
            "\\documentclass{article}\n\\usepackage{graphicx}\n\\usepackage{maison}\n\\begin{document}\n\\input{sections/intro}\nVoir \\cite{knuth} \\maison.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n",
        );
        w(
            "maison.sty",
            "\\ProvidesPackage{maison}\n\\newcommand{\\maison}{chez soi}\n",
        );
        w(
            "sections/intro.tex",
            "Un texte. % un commentaire\n\\includegraphics[width=1cm]{figures/point}\n",
        );
        w("sections/unused.tex", "Pas lu.\n");
        w(
            "refs.bib",
            "@book{knuth, author={Knuth, Donald}, title={The TeXbook}, year={1984}, publisher={Addison-Wesley}}\n",
        );
        std::fs::write(root.join("figures/point.png"), PIXEL).unwrap();
        std::fs::write(root.join("figures/other.png"), PIXEL).unwrap();

        let main = root.join("main.tex");
        let ws = Workspace::open(&root);
        let docs = ws.project_documents(&ws.root_for(&main));
        let facts = DocumentFacts::from_indexes(docs.iter().map(|d| &d.index));
        let settings = BuildSettings {
            precompile_preamble: false,
            ..ws.config.effective_build(&BuildSettings::default())
        };
        let plan = build::plan(&main, &settings, Some(&dist), &facts, crate::i18n::Lang::En)
            .expect("plan");
        let cancel = std::sync::atomic::AtomicBool::new(false);
        let source = |p: &Path| std::fs::read_to_string(p).ok();
        let ctx = RunContext {
            dist: &dist,
            settings: &settings,
            cancel: &cancel,
            lang: crate::i18n::Lang::En,
            source: &source,
            packages: None,
            background: false,
        };
        let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
        assert!(outcome.success, "{:#?}", outcome.diagnostics);

        let bib = ws.bib_files(&main);
        let t = Target {
            root_dir: &root,
            main: &main,
            out_dir: &plan.out_dir,
            bib_files: &bib,
        };
        let opts = ExportOptions {
            submission: true,
            strip_comments: true,
            include_bib: true,
            ..Default::default()
        };
        let export = super::plan(&t, &opts);
        assert!(export.recorded && !export.stale, "{export:#?}");
        let expected = [
            "figures/point.png",
            "main.bbl",
            "main.tex",
            "maison.sty",
            "refs.bib",
            "sections/intro.tex",
        ];
        assert_eq!(names(&export), expected, "{export:#?}");

        // With its preamble precompiled, a pass reads the format, not the
        // package of the project: the record of the format has it.
        let fast = BuildSettings {
            precompile_preamble: true,
            ..settings.clone()
        };
        if build::preamble::applies(&plan, &fast, &dist) {
            let text = std::fs::read_to_string(&main).unwrap();
            let pre = build::preamble::preamble_of(&text).expect("a preamble");
            let key = build::preamble::key(&plan, &fast, &dist, &pre);
            assert!(
                build::preamble::build_format(&plan, &dist, &[], key),
                "format"
            );
            let ctx = RunContext {
                settings: &fast,
                ..ctx
            };
            let outcome = build::run(&plan, &ctx, &mut |_: BuildEvent| {});
            assert!(outcome.success, "{:#?}", outcome.diagnostics);
            assert!(
                build::preamble::ready(&plan, key).is_some(),
                "the pass with the format worked"
            );
            let fls = std::fs::read_to_string(plan.out_dir.join("main.fls")).unwrap();
            assert!(fls.contains(".fmt") && !fls.contains("maison.sty"), "{fls}");
            assert_eq!(names(&super::plan(&t, &opts)), expected);
        } else {
            println!("no precompiled preamble with this distribution: not checked");
        }
        // The archive compiles on its own, without the bibliography tool
        // (its `.bbl` is there).
        let dest = root.join("submission.zip");
        write(&export, &t, &opts, &dest).unwrap();
        let alone = dir.path().join("alone");
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&dest).unwrap()).unwrap();
        zip.extract(&alone).unwrap();
        assert_eq!(
            std::fs::read_to_string(alone.join("sections/intro.tex")).unwrap(),
            "Un texte. %\n\\includegraphics[width=1cm]{figures/point}\n"
        );
        for _ in 0..2 {
            let run = crate::process::output(
                &dist
                    .engine_cmd(crate::tex::Engine::Pdflatex, true)
                    .args(["-interaction=nonstopmode", "-halt-on-error", "main.tex"])
                    .cwd(&alone),
                std::time::Duration::from_secs(300),
            )
            .unwrap();
            assert!(run.success(), "{}", run.stdout);
        }
        let log = std::fs::read_to_string(alone.join("main.log")).unwrap_or_default();
        assert!(
            !log.contains("Citation `knuth'"),
            "the citation is known from the .bbl\n{log}"
        );
    }
}

//! Native SyncTeX reader: source ⇄ PDF navigation.
//!
//! Reads the `.synctex.gz` written by the engine (pdfTeX, XeTeX, LuaTeX,
//! Tectonic) without the external `synctex` tool. Coordinates exchanged
//! with the viewer are PDF points (big points, 1/72 in) from the top-left
//! corner of the page.
//!
//! * **forward** (source → PDF): all boxes produced by a source line;
//! * **inverse** (PDF → source): the innermost line box under the point,
//!   refined with the glue/kern/math records it contains (paragraph line
//!   boxes are tagged with the paragraph's last line, inner records carry
//!   the real source line).

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Scaled points per big point.
const SP_PER_BP: f64 = 65781.76;

#[derive(Debug, Clone, Copy)]
struct Node {
    kind: u8,
    tag: u32,
    line: u32,
    h: i32,
    v: i32,
    w: i32,
    height: i32,
    depth: i32,
    /// Index of the enclosing box in the page's node list.
    parent: u32,
}

const NO_PARENT: u32 = u32::MAX;

impl Node {
    fn is_box(&self) -> bool {
        matches!(self.kind, b'[' | b'(' | b'h' | b'v')
    }

    fn is_hbox(&self) -> bool {
        matches!(self.kind, b'(' | b'h')
    }
}

#[derive(Debug, Default)]
struct Page {
    number: u32,
    nodes: Vec<Node>,
}

/// A rectangle in PDF points, origin at the top-left of the page.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Rect {
    /// Left.
    pub x: f64,
    /// Top.
    pub y: f64,
    /// Width.
    pub width: f64,
    /// Height.
    pub height: f64,
}

/// Where a source line appears in the PDF.
#[derive(Debug, Clone, Serialize)]
pub struct ForwardResult {
    /// One-based page.
    pub page: u32,
    /// Boxes of the line on that page.
    pub rects: Vec<Rect>,
}

/// Which source line produced a point of the PDF.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InverseResult {
    /// Source file.
    pub file: PathBuf,
    /// One-based line.
    pub line: u32,
}

/// A parsed SyncTeX file.
#[derive(Debug, Default)]
pub struct SyncTex {
    inputs: Vec<(u32, PathBuf)>,
    pages: Vec<Page>,
    unit: f64,
    x_offset: f64,
    y_offset: f64,
}

/// Errors while reading SyncTeX data.
#[derive(Debug, thiserror::Error)]
pub enum SyncTexError {
    /// I/O.
    #[error("cannot read SyncTeX data: {0}")]
    Io(#[from] std::io::Error),
    /// Not a SyncTeX file.
    #[error("invalid SyncTeX data")]
    Invalid,
}

impl SyncTex {
    /// Loads `file.synctex.gz` (or an uncompressed `.synctex`).
    pub fn load(path: &Path) -> Result<Self, SyncTexError> {
        let file = std::fs::File::open(path)?;
        if path.extension().is_some_and(|e| e == "gz") {
            Self::parse(BufReader::new(flate2::read::GzDecoder::new(file)))
        } else {
            Self::parse(BufReader::new(file))
        }
    }

    /// Parses SyncTeX data.
    pub fn parse<R: Read>(reader: BufReader<R>) -> Result<Self, SyncTexError> {
        let mut st = SyncTex {
            unit: 1.0,
            ..Default::default()
        };
        let mut magnification = 1000.0;
        let mut in_content = false;
        let mut stack: Vec<u32> = Vec::new();
        let mut current: Option<Page> = None;
        let mut seen_header = false;
        for line in reader.split(b'\n') {
            let line = line?;
            let line = String::from_utf8_lossy(&line);
            let line = line.trim_end_matches('\r');
            if !in_content {
                if line.starts_with("SyncTeX Version:") {
                    seen_header = true;
                } else if let Some(rest) = line.strip_prefix("Input:") {
                    if let Some((tag, path)) = rest.split_once(':')
                        && let Ok(tag) = tag.parse()
                    {
                        st.inputs
                            .push((tag, crate::log::normalize(Path::new(path))));
                    }
                } else if let Some(v) = line.strip_prefix("Unit:") {
                    st.unit = v.trim().parse().unwrap_or(1.0);
                } else if let Some(v) = line.strip_prefix("Magnification:") {
                    magnification = v.trim().parse().unwrap_or(1000.0);
                } else if let Some(v) = line.strip_prefix("X Offset:") {
                    st.x_offset = v.trim().parse().unwrap_or(0.0);
                } else if let Some(v) = line.strip_prefix("Y Offset:") {
                    st.y_offset = v.trim().parse().unwrap_or(0.0);
                } else if line.starts_with("Content:") {
                    in_content = true;
                }
                continue;
            }
            // Inputs can also appear inside the content (files opened later).
            if let Some(rest) = line.strip_prefix("Input:") {
                if let Some((tag, path)) = rest.split_once(':')
                    && let Ok(tag) = tag.parse()
                {
                    st.inputs
                        .push((tag, crate::log::normalize(Path::new(path))));
                }
                continue;
            }
            if line.starts_with("Postamble:") {
                break;
            }
            let Some(&kind) = line.as_bytes().first() else {
                continue;
            };
            match kind {
                b'{' => {
                    let number = line[1..]
                        .trim()
                        .parse()
                        .unwrap_or(st.pages.len() as u32 + 1);
                    current = Some(Page {
                        number,
                        nodes: Vec::new(),
                    });
                    stack.clear();
                }
                b'}' => {
                    if let Some(p) = current.take() {
                        st.pages.push(p);
                    }
                }
                b']' | b')' => {
                    stack.pop();
                }
                b'[' | b'(' | b'h' | b'v' | b'x' | b'k' | b'g' | b'$' => {
                    let Some(page) = current.as_mut() else {
                        continue;
                    };
                    let Some(node) =
                        parse_record(kind, &line[1..], stack.last().copied().unwrap_or(NO_PARENT))
                    else {
                        continue;
                    };
                    page.nodes.push(node);
                    if kind == b'[' || kind == b'(' {
                        stack.push(page.nodes.len() as u32 - 1);
                    }
                }
                _ => {}
            }
        }
        if !seen_header {
            return Err(SyncTexError::Invalid);
        }
        st.unit *= magnification / 1000.0;
        Ok(st)
    }

    fn bp(&self, sp: i32) -> f64 {
        sp as f64 * self.unit / SP_PER_BP
    }

    fn tags_for(&self, file: &Path) -> Vec<u32> {
        let want = crate::log::normalize(file);
        let canonical = dunce::canonicalize(file).ok();
        let mut tags: Vec<u32> = self
            .inputs
            .iter()
            .filter(|(_, p)| {
                *p == want
                    || canonical
                        .as_ref()
                        .is_some_and(|c| dunce::canonicalize(p).ok().as_ref() == Some(c))
            })
            .map(|(t, _)| *t)
            .collect();
        if tags.is_empty() {
            // Fall back on the file name when paths differ (moved project, symlinks).
            let name = file.file_name();
            let matches: Vec<u32> = self
                .inputs
                .iter()
                .filter(|(_, p)| p.file_name() == name)
                .map(|(t, _)| *t)
                .collect();
            if matches.len() == 1 {
                tags = matches;
            }
        }
        tags
    }

    fn rect_of(&self, n: &Node) -> Rect {
        Rect {
            x: self.bp(n.h) + self.x_offset / SP_PER_BP,
            y: self.bp(n.v - n.height) + self.y_offset / SP_PER_BP,
            width: self.bp(n.w).max(1.0),
            height: self.bp(n.height + n.depth).max(1.0),
        }
    }

    /// Where `line` (one-based) of `file` appears.
    pub fn forward(&self, file: &Path, line: u32) -> Option<ForwardResult> {
        let tags = self.tags_for(file);
        if tags.is_empty() {
            return None;
        }
        // Try the exact line, then the following lines, then the previous ones.
        let candidates = std::iter::once(line)
            .chain((1..=20).map(|d| line + d))
            .chain(
                (1..=20)
                    .filter_map(|d| line.checked_sub(d))
                    .filter(|l| *l > 0),
            );
        for target in candidates {
            for page in &self.pages {
                let mut rects: Vec<Rect> = Vec::new();
                let mut boxes: Vec<u32> = Vec::new();
                for (i, n) in page.nodes.iter().enumerate() {
                    if n.line != target || !tags.contains(&n.tag) {
                        continue;
                    }
                    let box_index = if n.is_hbox() {
                        Some(i as u32)
                    } else {
                        enclosing_hbox(page, n.parent)
                    };
                    if let Some(b) = box_index
                        && !boxes.contains(&b)
                    {
                        boxes.push(b);
                    }
                }
                for b in boxes {
                    let n = &page.nodes[b as usize];
                    let r = self.rect_of(n);
                    // Merge rectangles that belong to the same visual line.
                    if !rects
                        .iter()
                        .any(|x| (x.y - r.y).abs() < 0.5 && (x.x - r.x).abs() < 0.5)
                    {
                        rects.push(r);
                    }
                }
                if !rects.is_empty() {
                    rects.sort_by(|a, b| a.y.total_cmp(&b.y));
                    return Some(ForwardResult {
                        page: page.number,
                        rects,
                    });
                }
            }
        }
        None
    }

    /// The source position of point `(x, y)` (PDF points from the top-left) on `page`.
    pub fn inverse(&self, page: u32, x: f64, y: f64) -> Option<InverseResult> {
        let page = self.pages.iter().find(|p| p.number == page)?;
        let (xs, ys) = (
            (x - self.x_offset / SP_PER_BP) * SP_PER_BP / self.unit,
            (y - self.y_offset / SP_PER_BP) * SP_PER_BP / self.unit,
        );
        let (xs, ys) = (xs as i64, ys as i64);
        let contains = |n: &Node| {
            n.h as i64 <= xs
                && xs <= (n.h + n.w) as i64
                && (n.v - n.height) as i64 <= ys
                && ys <= (n.v + n.depth) as i64
        };
        // Innermost hbox containing the point (smallest area).
        let mut best: Option<(i64, usize)> = None;
        for (i, n) in page.nodes.iter().enumerate() {
            if n.is_hbox() && contains(n) {
                let area = (n.w as i64).max(1) * ((n.height + n.depth) as i64).max(1);
                if best.is_none_or(|(a, _)| area < a) {
                    best = Some((area, i));
                }
            }
        }
        let box_index = match best {
            Some((_, i)) => i,
            None => {
                // Nearest hbox, vertical distance first.
                page.nodes
                    .iter()
                    .enumerate()
                    .filter(|(_, n)| n.is_hbox() && n.w > 0)
                    .min_by_key(|(_, n)| {
                        let top = (n.v - n.height) as i64;
                        let bottom = (n.v + n.depth) as i64;
                        let dy = if ys < top {
                            top - ys
                        } else if ys > bottom {
                            ys - bottom
                        } else {
                            0
                        };
                        let dx = if xs < n.h as i64 {
                            n.h as i64 - xs
                        } else if xs > (n.h + n.w) as i64 {
                            xs - (n.h + n.w) as i64
                        } else {
                            0
                        };
                        dy * 8 + dx
                    })?
                    .0
            }
        };
        // Refine with the records inside that box: last one at or before x.
        // A paragraph line box is tagged with the line that *ended* the paragraph
        // (often the blank line after it): prefer the inner records' lines.
        let box_line = page.nodes[box_index].line;
        let all: Vec<&Node> = page
            .nodes
            .iter()
            .filter(|n| n.parent == box_index as u32 && !n.is_box())
            .collect();
        let precise: Vec<&Node> = all.iter().copied().filter(|n| n.line != box_line).collect();
        let children = if precise.is_empty() { all } else { precise };
        let mut chosen = &page.nodes[box_index];
        let mut best_dx = i64::MAX;
        for c in children {
            let dx = xs - c.h as i64;
            let score = if dx >= 0 { dx } else { -dx * 4 };
            if score < best_dx {
                best_dx = score;
                chosen = c;
            }
        }
        let file = self
            .inputs
            .iter()
            .find(|(t, _)| *t == chosen.tag)
            .map(|(_, p)| p.clone())?;
        Some(InverseResult {
            file,
            line: chosen.line.max(1),
        })
    }

    /// Number of pages described.
    pub fn page_count(&self) -> usize {
        self.pages.len()
    }
}

fn enclosing_hbox(page: &Page, mut index: u32) -> Option<u32> {
    while index != NO_PARENT {
        let n = &page.nodes[index as usize];
        if n.is_hbox() {
            return Some(index);
        }
        index = n.parent;
    }
    None
}

/// Parses `tag,line[,col]:h,v[:W[,H,D]]`.
fn parse_record(kind: u8, rest: &str, parent: u32) -> Option<Node> {
    let (link, geometry) = rest.split_once(':')?;
    let mut link = link.split(',');
    let tag = link.next()?.parse().ok()?;
    let line: i64 = link.next()?.parse().ok()?;
    let mut parts = geometry.split(':');
    let mut pos = parts.next()?.split(',');
    let h = pos.next()?.parse().ok()?;
    let v = pos.next()?.parse().ok()?;
    let (mut w, mut height, mut depth) = (0, 0, 0);
    if let Some(size) = parts.next() {
        let mut s = size.split(',');
        w = s.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        height = s.next().and_then(|x| x.parse().ok()).unwrap_or(0);
        depth = s.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    }
    if kind == b'k' {
        // Kerns: W is the kern amount, not a box width.
        height = 0;
        depth = 0;
    }
    Some(Node {
        kind,
        tag,
        line: line.max(0) as u32,
        h,
        v,
        w,
        height,
        depth,
        parent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "SyncTeX Version:1\nInput:1:/p/./s.tex\nInput:2:/tex/article.cls\nOutput:pdf\nMagnification:1000\nUnit:1\nX Offset:0\nY Offset:0\nContent:\n!100\n{1\n[1,10:4736286,46220574:26673152,41484288,0\n[1,10:8799518,44254494:22609920,36044800,0\n(1,3:8799518,8865054:22609920,655359,0\ng1,3:8799518,8865054\nx1,3:9330359,8865054\n)\n(1,5:8799518,10300473:22609920,455111,127431\nx1,4:10179418,10300473\nk1,4:13315918,10300473:220140\nx1,5:20000000,10300473\n)\n]\n]\n}1\n{2\n[1,11:4736286,46220574:26673152,41484288,0\n(1,11:8799518,8865054:22609920,655359,0\nx1,11:9000000,8865054\n)\n]\n}2\nPostamble:\n";

    fn sample() -> SyncTex {
        SyncTex::parse(BufReader::new(SAMPLE.as_bytes())).unwrap()
    }

    #[test]
    fn forward_search() {
        let st = sample();
        let r = st.forward(Path::new("/p/s.tex"), 4).unwrap();
        assert_eq!(r.page, 1);
        assert_eq!(r.rects.len(), 1);
        let rect = r.rects[0];
        assert!((rect.x - 133.768).abs() < 0.01, "{rect:?}");
        assert!((rect.y - (10300473.0 - 455111.0) / SP_PER_BP).abs() < 0.01);
        assert_eq!(st.forward(Path::new("/p/s.tex"), 11).unwrap().page, 2);
        // Line 7 has no record: the next line with output is used.
        assert_eq!(st.forward(Path::new("/p/s.tex"), 7).unwrap().page, 2);
        assert!(st.forward(Path::new("/other.tex"), 4).is_none());
    }

    #[test]
    fn inverse_search() {
        let st = sample();
        // A point on the second text line, near the start: inner record of line 4.
        let x = 10_300_000.0 / SP_PER_BP;
        let y = 10_200_000.0 / SP_PER_BP;
        let r = st.inverse(1, x, y).unwrap();
        assert_eq!(
            r,
            InverseResult {
                file: PathBuf::from("/p/s.tex"),
                line: 4
            }
        );
        // Far right of that line: records of the paragraph line are preferred
        // over the box's own tag (the line that ended the paragraph).
        let r = st.inverse(1, 21_000_000.0 / SP_PER_BP, y).unwrap();
        assert_eq!(r.line, 4);
        // The title line.
        assert_eq!(
            st.inverse(1, 140.0, 8_600_000.0 / SP_PER_BP).unwrap().line,
            3
        );
        assert_eq!(st.inverse(2, 150.0, 130.0).unwrap().line, 11);
    }

    /// Compares with the official `synctex` tool.
    #[test]
    #[ignore = "depends on the local TeX installation"]
    fn agrees_with_synctex_cli() {
        let dist = crate::tex::detect(&[]).into_iter().next().expect("no TeX");
        // The reference: TeX's own `synctex` command (not in every install).
        if dist.tool("synctex").is_none() {
            eprintln!("no synctex command in {}: comparison skipped", dist.name);
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let tex = dir.path().join("s.tex");
        std::fs::write(&tex, "\\documentclass{article}\n\\begin{document}\n\\section{Hello}\nFirst paragraph with some text that is long enough to wrap onto a second line of the page, hopefully yes indeed.\n\nSecond paragraph $x^2+y^2=z^2$ here.\n\\begin{equation}\na = b + c\n\\end{equation}\n\\newpage\nPage two text.\n\\end{document}\n").unwrap();
        let out = crate::process::output(
            &dist.cmd("pdflatex").cwd(dir.path()).args([
                "-synctex=1",
                "-interaction=nonstopmode",
                "s.tex",
            ]),
            std::time::Duration::from_secs(60),
        )
        .unwrap();
        assert!(out.success());
        let st = SyncTex::load(&dir.path().join("s.synctex.gz")).unwrap();
        for line in [4u32, 6, 8, 11] {
            let ours = st.forward(&tex, line).unwrap();
            // TeX Live records `s.tex`, MiKTeX the full path.
            let view = |name: &str| {
                crate::process::output(
                    &dist.cmd("synctex").cwd(dir.path()).args([
                        "view",
                        "-i",
                        &format!("{line}:1:{name}"),
                        "-o",
                        "s.pdf",
                    ]),
                    std::time::Duration::from_secs(10),
                )
                .unwrap()
            };
            let mut cli = view("s.tex");
            if !cli.stdout.contains("Page:") {
                cli = view(&tex.to_string_lossy());
            }
            let page: u32 = cli
                .stdout
                .lines()
                .find_map(|l| l.strip_prefix("Page:"))
                .unwrap_or_else(|| panic!("synctex: {} {}", cli.stdout, cli.stderr))
                .parse()
                .unwrap();
            let v: f64 = cli
                .stdout
                .lines()
                .find_map(|l| l.strip_prefix("v:"))
                .unwrap()
                .parse()
                .unwrap();
            let big_h: f64 = cli
                .stdout
                .lines()
                .find_map(|l| l.strip_prefix("H:"))
                .unwrap()
                .parse()
                .unwrap();
            println!(
                "line {line}: ours page {} {:?} / cli page {page} v {v} H {big_h}",
                ours.page, ours.rects[0]
            );
            assert_eq!(ours.page, page);
            assert!(
                ours.rects
                    .iter()
                    .any(|r| (r.y + r.height - v).abs() < big_h + 2.0)
            );
            // Inverse from the middle of our rectangle comes back to the same line (or the paragraph).
            let r = ours.rects[0];
            let back = st
                .inverse(ours.page, r.x + 5.0, r.y + r.height / 2.0)
                .unwrap();
            let cli = crate::process::output(
                &dist.cmd("synctex").cwd(dir.path()).args([
                    "edit",
                    "-o",
                    &format!("{}:{}:{}:s.pdf", ours.page, r.x + 5.0, r.y + r.height / 2.0),
                ]),
                std::time::Duration::from_secs(10),
            )
            .unwrap();
            let cli_line: u32 = cli
                .stdout
                .lines()
                .find_map(|l| l.strip_prefix("Line:"))
                .unwrap()
                .parse()
                .unwrap();
            println!("  inverse: ours {} cli {cli_line}", back.line);
            assert!(back.line.abs_diff(cli_line) <= 1);
        }
    }
}

//! Text positions.
//!
//! Internally everything works on UTF-8 byte offsets. At the API boundary we
//! speak the same language as the editor (CodeMirror / LSP): zero-based lines
//! and columns counted in **UTF-16 code units**. [`LineIndex`] converts between
//! the two in `O(log n)` for the line lookup plus `O(line length)` for the
//! column.

use serde::{Deserialize, Serialize};

/// A zero-based `(line, character)` position; `character` counts UTF-16 units.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default, Serialize, Deserialize,
)]
pub struct Position {
    /// Zero-based line number.
    pub line: u32,
    /// Zero-based column in UTF-16 code units.
    pub character: u32,
}

impl Position {
    /// Creates a position.
    pub const fn new(line: u32, character: u32) -> Self {
        Self { line, character }
    }
}

/// A half-open range `[start, end)` between two [`Position`]s.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct Range {
    /// Inclusive start.
    pub start: Position,
    /// Exclusive end.
    pub end: Position,
}

/// A half-open byte range inside a source text.
pub type Span = std::ops::Range<usize>;

/// Precomputed line starts of a text, used for offset ⇄ position conversions.
#[derive(Debug, Clone, Default)]
pub struct LineIndex {
    /// Byte offset of the first character of every line.
    starts: Vec<u32>,
    len: u32,
}

impl LineIndex {
    /// Indexes `text`.
    pub fn new(text: &str) -> Self {
        let mut starts = Vec::with_capacity(text.len() / 40 + 1);
        starts.push(0);
        starts.extend(memchr::memchr_iter(b'\n', text.as_bytes()).map(|i| i as u32 + 1));
        Self {
            starts,
            len: text.len() as u32,
        }
    }

    /// Number of lines (a trailing newline opens an empty last line).
    pub fn line_count(&self) -> usize {
        self.starts.len()
    }

    /// Byte offset where `line` starts (clamped to the text length).
    pub fn line_start(&self, line: usize) -> usize {
        self.starts.get(line).copied().unwrap_or(self.len) as usize
    }

    /// Byte span of `line`, excluding its line terminator.
    pub fn line_span(&self, text: &str, line: usize) -> Span {
        let start = self.line_start(line);
        let mut end = self.line_start(line + 1);
        let bytes = text.as_bytes();
        if end > start && end <= bytes.len() && line + 1 < self.starts.len() {
            end -= 1; // '\n'
            if end > start && bytes[end - 1] == b'\r' {
                end -= 1;
            }
        }
        start..end.max(start)
    }

    /// Zero-based line containing byte `offset`.
    pub fn line_of(&self, offset: usize) -> usize {
        match self.starts.binary_search(&(offset as u32)) {
            Ok(line) => line,
            Err(next) => next - 1,
        }
    }

    /// Converts a byte offset into an editor [`Position`].
    pub fn position(&self, text: &str, offset: usize) -> Position {
        let offset = floor_char_boundary(text, offset.min(text.len()));
        let line = self.line_of(offset);
        let start = self.line_start(line);
        Position::new(line as u32, utf16_len(&text[start..offset]) as u32)
    }

    /// Converts a byte span into an editor [`Range`].
    pub fn range(&self, text: &str, span: Span) -> Range {
        Range {
            start: self.position(text, span.start),
            end: self.position(text, span.end),
        }
    }

    /// Converts an editor [`Position`] into a byte offset (clamped to the line).
    pub fn offset(&self, text: &str, pos: Position) -> usize {
        let line = pos.line as usize;
        if line >= self.starts.len() {
            return text.len();
        }
        let span = self.line_span(text, line);
        span.start + utf16_to_byte(&text[span.clone()], pos.character as usize)
    }
}

/// Length of `s` in UTF-16 code units.
pub fn utf16_len(s: &str) -> usize {
    if s.is_ascii() {
        s.len()
    } else {
        s.chars().map(char::len_utf16).sum()
    }
}

/// Byte offset inside `s` corresponding to `units` UTF-16 code units (clamped).
pub fn utf16_to_byte(s: &str, units: usize) -> usize {
    if s.is_ascii() {
        return units.min(s.len());
    }
    let mut count = 0;
    for (i, c) in s.char_indices() {
        if count >= units {
            return i;
        }
        count += c.len_utf16();
    }
    s.len()
}

/// Largest char boundary `<= offset`.
pub fn floor_char_boundary(s: &str, mut offset: usize) -> usize {
    if offset >= s.len() {
        return s.len();
    }
    while !s.is_char_boundary(offset) {
        offset -= 1;
    }
    offset
}

/// Truncates `s` to at most `max` characters, appending `…` when shortened.
pub fn ellipsize(s: &str, max: usize) -> String {
    let mut out = String::new();
    for (count, c) in s.chars().enumerate() {
        if count == max {
            out.push('…');
            return out;
        }
        out.push(c);
    }
    out
}

/// Collapses runs of whitespace (including newlines) into single spaces.
pub fn squash_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = true;
    for c in s.chars() {
        if c.is_whitespace() {
            if !last_space {
                out.push(' ');
                last_space = true;
            }
        } else {
            out.push(c);
            last_space = false;
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn positions_roundtrip_with_multibyte_characters() {
        let text = "héllo\n𝔸b\r\nlast";
        let idx = LineIndex::new(text);
        assert_eq!(idx.line_count(), 3);
        // 'l' after "hé" is byte 3 but UTF-16 column 2.
        assert_eq!(idx.position(text, 3), Position::new(0, 2));
        // 'b' after the astral 𝔸 (4 bytes, 2 UTF-16 units).
        let b = text.find('b').unwrap();
        assert_eq!(idx.position(text, b), Position::new(1, 2));
        assert_eq!(idx.offset(text, Position::new(1, 2)), b);
        assert_eq!(idx.line_span(text, 1), 7..12);
        assert_eq!(idx.offset(text, Position::new(2, 99)), text.len());
    }

    #[test]
    fn helpers() {
        assert_eq!(squash_whitespace("  a \n\t b  "), "a b");
        assert_eq!(ellipsize("abcdef", 3), "abc…");
        assert_eq!(utf16_len("é𝔸"), 3);
    }
}

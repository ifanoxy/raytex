//! Static completion data: colors, TikZ libraries, `@` shortcuts, float
//! placements, graphics options, built-in snippets.

use std::sync::LazyLock;

use serde::Deserialize;

use crate::kb::Doc;

/// `@x` shortcut → inserted snippet (LaTeX Workshop compatible).
pub const AT_SHORTCUTS: &[(&str, &str)] = &[
    ("a", "\\alpha"),
    ("b", "\\beta"),
    ("g", "\\gamma"),
    ("d", "\\delta"),
    ("e", "\\varepsilon"),
    ("z", "\\zeta"),
    ("h", "\\eta"),
    ("q", "\\theta"),
    ("i", "\\iota"),
    ("k", "\\kappa"),
    ("l", "\\lambda"),
    ("m", "\\mu"),
    ("n", "\\nu"),
    ("x", "\\xi"),
    ("p", "\\pi"),
    ("r", "\\rho"),
    ("s", "\\sigma"),
    ("t", "\\tau"),
    ("u", "\\upsilon"),
    ("f", "\\varphi"),
    ("c", "\\chi"),
    ("y", "\\psi"),
    ("w", "\\omega"),
    ("G", "\\Gamma"),
    ("D", "\\Delta"),
    ("Q", "\\Theta"),
    ("L", "\\Lambda"),
    ("X", "\\Xi"),
    ("P", "\\Pi"),
    ("S", "\\Sigma"),
    ("U", "\\Upsilon"),
    ("F", "\\Phi"),
    ("Y", "\\Psi"),
    ("W", "\\Omega"),
    ("8", "\\infty"),
    ("6", "\\partial"),
    ("0", "\\emptyset"),
    ("/", "\\frac{${1}}{${2}}"),
    ("%", "\\frac{${1}}{${2}}"),
    (".", "\\cdot"),
    ("*", "\\times"),
    ("+", "\\cup"),
    ("-", "\\cap"),
    ("=", "\\equiv"),
    ("<", "\\leq"),
    (">", "\\geq"),
    ("(", "\\left( ${1} \\right)"),
    ("[", "\\left[ ${1} \\right]"),
    ("{", "\\left\\\\{ ${1} \\right\\\\}"),
    ("|", "\\left| ${1} \\right|"),
    ("^", "\\hat{${1}}"),
    ("_", "\\bar{${1}}"),
    ("~", "\\tilde{${1}}"),
    (">>", "\\gg"),
    ("<<", "\\ll"),
    ("->", "\\to"),
    ("=>", "\\implies"),
    ("<=", "\\Leftarrow"),
    ("v", "\\vee"),
    ("&", "\\wedge"),
    ("N", "\\mathbb{N}"),
    ("Z", "\\mathbb{Z}"),
    ("R", "\\mathbb{R}"),
    ("C", "\\mathbb{C}"),
    ("V", "\\vec{${1}}"),
    ("I", "\\int_{${1}}^{${2}}"),
    ("2", "\\sqrt{${1}}"),
    ("!", "\\neg"),
    ("A", "\\forall"),
    ("E", "\\exists"),
];

/// The `@` shortcut of a command (`alpha` → `a`, `frac` → `/`), for the
/// commands whose shortcut inserts nothing else.
pub fn at_shortcut_of(command: &str) -> Option<&'static str> {
    static BY_COMMAND: LazyLock<std::collections::HashMap<&'static str, &'static str>> =
        LazyLock::new(|| {
            let mut map = std::collections::HashMap::new();
            for (key, value) in AT_SHORTCUTS {
                let Some(rest) = value.strip_prefix('\\') else {
                    continue;
                };
                let name_len = rest
                    .find(|c: char| !c.is_ascii_alphabetic())
                    .unwrap_or(rest.len());
                let (name, args) = rest.split_at(name_len);
                // `\frac{${1}}{${2}}` is `\frac`; `\mathbb{N}` is not `\mathbb`.
                let only_fields = args
                    .split("${")
                    .skip(1)
                    .all(|f| f.starts_with(|c: char| c.is_ascii_digit()))
                    && args
                        .replace(|c: char| "{}$0123456789".contains(c), "")
                        .is_empty();
                if !name.is_empty() && only_fields {
                    map.entry(name).or_insert(*key);
                }
            }
            map
        });
    BY_COMMAND.get(command).copied()
}

/// xcolor base colors with their RGB value.
pub const BASE_COLORS: &[(&str, &str)] = &[
    ("black", "#000000"),
    ("blue", "#0000FF"),
    ("brown", "#BF8040"),
    ("cyan", "#00FFFF"),
    ("darkgray", "#404040"),
    ("gray", "#808080"),
    ("green", "#00FF00"),
    ("lightgray", "#BFBFBF"),
    ("lime", "#BFFF00"),
    ("magenta", "#FF00FF"),
    ("olive", "#808000"),
    ("orange", "#FF8000"),
    ("pink", "#FFBFBF"),
    ("purple", "#BF0040"),
    ("red", "#FF0000"),
    ("teal", "#008080"),
    ("violet", "#800080"),
    ("white", "#FFFFFF"),
    ("yellow", "#FFFF00"),
];

/// xcolor `dvipsnames` colors.
pub const DVIPS_COLORS: &[(&str, &str)] = &[
    ("Apricot", "#FBB982"),
    ("Aquamarine", "#00B5BE"),
    ("Bittersweet", "#C04F17"),
    ("Black", "#221E1F"),
    ("Blue", "#2D2F92"),
    ("BlueGreen", "#00B3B8"),
    ("BlueViolet", "#473992"),
    ("BrickRed", "#B6321C"),
    ("Brown", "#792500"),
    ("BurntOrange", "#F7921D"),
    ("CadetBlue", "#74729A"),
    ("CarnationPink", "#F282B4"),
    ("Cerulean", "#00A2E3"),
    ("CornflowerBlue", "#41B0E4"),
    ("Cyan", "#00AEEF"),
    ("Dandelion", "#FDBC42"),
    ("DarkOrchid", "#A4538A"),
    ("Emerald", "#00A99D"),
    ("ForestGreen", "#009B55"),
    ("Fuchsia", "#8C368C"),
    ("Goldenrod", "#FFDF42"),
    ("Gray", "#949698"),
    ("Green", "#00A64F"),
    ("GreenYellow", "#DFE674"),
    ("JungleGreen", "#00A99A"),
    ("Lavender", "#F49EC4"),
    ("LimeGreen", "#8DC73E"),
    ("Magenta", "#EC008C"),
    ("Mahogany", "#A9341F"),
    ("Maroon", "#AF3235"),
    ("Melon", "#F89E7B"),
    ("MidnightBlue", "#006795"),
    ("Mulberry", "#A93C93"),
    ("NavyBlue", "#006EB8"),
    ("OliveGreen", "#3C8031"),
    ("Orange", "#F58137"),
    ("OrangeRed", "#ED135A"),
    ("Orchid", "#AF72B0"),
    ("Peach", "#F7965A"),
    ("Periwinkle", "#7977B8"),
    ("PineGreen", "#008B72"),
    ("Plum", "#92268F"),
    ("ProcessBlue", "#00B0F0"),
    ("Purple", "#99479B"),
    ("RawSienna", "#974006"),
    ("Red", "#ED1B23"),
    ("RedOrange", "#F26035"),
    ("RedViolet", "#A1246B"),
    ("Rhodamine", "#EF559F"),
    ("RoyalBlue", "#0071BC"),
    ("RoyalPurple", "#613F99"),
    ("RubineRed", "#ED017D"),
    ("Salmon", "#F69289"),
    ("SeaGreen", "#3FBC9D"),
    ("Sepia", "#671800"),
    ("SkyBlue", "#46C5DD"),
    ("SpringGreen", "#C6DC67"),
    ("Tan", "#DA9D76"),
    ("TealBlue", "#00AEB3"),
    ("Thistle", "#D883B7"),
    ("Turquoise", "#00B4CE"),
    ("Violet", "#58429B"),
    ("VioletRed", "#EF58A0"),
    ("White", "#FFFFFF"),
    ("WildStrawberry", "#EE2967"),
    ("Yellow", "#FFF200"),
    ("YellowGreen", "#98CC70"),
    ("YellowOrange", "#FAA21A"),
];

/// Common TikZ libraries.
pub const TIKZ_LIBRARIES: &[&str] = &[
    "3d",
    "angles",
    "arrows",
    "arrows.meta",
    "automata",
    "babel",
    "backgrounds",
    "bending",
    "calc",
    "calendar",
    "cd",
    "chains",
    "circuits.ee.IEC",
    "circuits.logic.US",
    "datavisualization",
    "decorations",
    "decorations.markings",
    "decorations.pathmorphing",
    "decorations.pathreplacing",
    "decorations.text",
    "er",
    "external",
    "fadings",
    "fit",
    "fpu",
    "graphs",
    "intersections",
    "lindenmayersystems",
    "math",
    "matrix",
    "mindmap",
    "patterns",
    "patterns.meta",
    "perspective",
    "petri",
    "plotmarks",
    "positioning",
    "quotes",
    "shadings",
    "shadows",
    "shapes",
    "shapes.arrows",
    "shapes.callouts",
    "shapes.geometric",
    "shapes.misc",
    "shapes.multipart",
    "shapes.symbols",
    "spy",
    "svg.path",
    "through",
    "topaths",
    "trees",
    "turtle",
    "fillbetween",
    "groupplots",
    "statistics",
    "polar",
    "colormaps",
    "units",
];

/// Float placement specifiers.
pub const PLACEMENTS: &[(&str, &str, &str)] = &[
    (
        "htbp",
        "Anywhere, in this order of preference",
        "N'importe où, dans cet ordre de préférence",
    ),
    ("h", "Here (approximately)", "Ici (approximativement)"),
    ("t", "Top of a page", "En haut d'une page"),
    ("b", "Bottom of a page", "En bas d'une page"),
    ("p", "On a page of floats", "Sur une page de flottants"),
    (
        "H",
        "Exactly here (float package)",
        "Exactement ici (package float)",
    ),
    (
        "!htbp",
        "Anywhere, relaxing the rules",
        "N'importe où, en assouplissant les règles",
    ),
    (
        "!ht",
        "Here or top, relaxing the rules",
        "Ici ou en haut, en assouplissant les règles",
    ),
];

/// A built-in snippet.
#[derive(Debug, Clone, Deserialize)]
pub struct Snippet {
    /// Trigger word.
    pub trigger: String,
    /// Name.
    pub name: Doc,
    /// Body (CodeMirror snippet syntax).
    pub body: String,
    /// Only in math mode.
    #[serde(default)]
    pub math: bool,
    /// Package needed.
    #[serde(default)]
    pub package: Option<String>,
}

static SNIPPETS: LazyLock<Vec<Snippet>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../data/snippets.json")).expect("snippets.json")
});

/// Built-in snippets.
pub fn snippets() -> &'static [Snippet] {
    &SNIPPETS
}

/// Option values proposed for `\usepackage[…]{babel}` and `polyglossia`.
pub const LANGUAGES: &[&str] = &[
    "french",
    "english",
    "british",
    "american",
    "german",
    "ngerman",
    "spanish",
    "italian",
    "portuguese",
    "brazilian",
    "dutch",
    "catalan",
    "polish",
    "russian",
    "greek",
    "arabic",
    "turkish",
    "swedish",
    "danish",
    "norsk",
    "finnish",
    "czech",
    "romanian",
    "latin",
    "hungarian",
    "ukrainian",
    "japanese",
    "chinese",
    "hebrew",
    "vietnamese",
    "breton",
    "occitan",
    "basque",
    "galician",
    "croatian",
    "slovak",
    "slovene",
    "serbian",
    "estonian",
    "latvian",
    "lithuanian",
    "icelandic",
    "irish",
    "welsh",
    "esperanto",
];

#[cfg(test)]
mod tests {
    #[test]
    fn snippets_parse() {
        assert!(super::snippets().len() > 30);
    }
}

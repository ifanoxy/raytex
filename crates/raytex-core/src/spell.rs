//! Spelling: words checked against dictionaries in the Hunspell format.
//!
//! RayTeX ships no dictionary. The one of a language is downloaded when the
//! user asks for it, and only then, from the repository of the dictionaries
//! of LibreOffice, at a commit fixed here (what is downloaded cannot change
//! under the same address). It is kept with the data of the application and
//! serves without a connection from then on.
//!
//! The words the user adds are kept in a file of their own, next to the
//! dictionaries: they are right in every language.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use serde::Serialize;

/// The repository the dictionaries come from, as it is shown to the user.
pub const SOURCE: &str = "github.com/LibreOffice/dictionaries";
/// The commit of that repository the files are taken at (22 August 2026).
const COMMIT: &str = "32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4";

/// A dictionary that can be downloaded.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    /// Language tag (`fr`, `en-GB`).
    pub tag: &'static str,
    /// Its files in the repository, without their extension (`.aff`, `.dic`).
    pub path: &'static str,
    /// Size of the two files, in bytes.
    pub size: u64,
}

/// The dictionaries offered, with the sizes of their files at [`COMMIT`].
pub const CATALOG: &[Entry] = &[
    Entry {
        tag: "fr",
        path: "fr_FR/dictionaries/fr",
        size: 199_870 + 1_236_490,
    },
    Entry {
        tag: "en-US",
        path: "en/en_US",
        size: 3_205 + 551_762,
    },
    Entry {
        tag: "en-GB",
        path: "en/en_GB",
        size: 44_158 + 1_230_571,
    },
    Entry {
        tag: "en-CA",
        path: "en/en_CA",
        size: 3_205 + 551_583,
    },
    Entry {
        tag: "en-AU",
        path: "en/en_AU",
        size: 3_205 + 554_336,
    },
    Entry {
        tag: "de",
        path: "de/de_DE_frami",
        size: 19_067 + 4_356_903,
    },
    Entry {
        tag: "de-AT",
        path: "de/de_AT_frami",
        size: 19_068 + 4_359_309,
    },
    Entry {
        tag: "de-CH",
        path: "de/de_CH_frami",
        size: 19_068 + 4_358_308,
    },
    Entry {
        tag: "es",
        path: "es/es_ES",
        size: 169_202 + 715_989,
    },
    Entry {
        tag: "it",
        path: "it_IT/it_IT",
        size: 70_054 + 1_295_083,
    },
    Entry {
        tag: "pt-PT",
        path: "pt_PT/pt_PT",
        size: 95_089 + 1_485_977,
    },
    Entry {
        tag: "pt-BR",
        path: "pt_BR/pt_BR",
        size: 979_792 + 4_477_695,
    },
    Entry {
        tag: "nl",
        path: "nl_NL/nl_NL",
        size: 46_557 + 2_488_246,
    },
    Entry {
        tag: "ca",
        path: "ca/dictionaries/ca",
        size: 52_471 + 3_086_130,
    },
    Entry {
        tag: "pl",
        path: "pl_PL/pl_PL",
        size: 257_542 + 5_252_096,
    },
    Entry {
        tag: "sv",
        path: "sv_SE/dictionaries/sv_SE",
        size: 18_583 + 2_344_202,
    },
    Entry {
        tag: "da",
        path: "da_DK/da_DK",
        size: 82_864 + 3_894_244,
    },
    Entry {
        tag: "nb",
        path: "no/nb_NO",
        size: 17_382 + 9_336_265,
    },
    Entry {
        tag: "cs",
        path: "cs_CZ/cs_CZ",
        size: 111_575 + 3_656_362,
    },
    Entry {
        tag: "ru",
        path: "ru_RU/ru_RU",
        size: 71_236 + 3_473_191,
    },
    Entry {
        tag: "el",
        path: "el_GR/el_GR",
        size: 15_647 + 10_125_390,
    },
];

impl Entry {
    /// The addresses of its two files: `[aff, dic]`.
    pub fn urls(&self) -> [String; 2] {
        ["aff", "dic"].map(|ext| {
            format!(
                "https://raw.githubusercontent.com/LibreOffice/dictionaries/{COMMIT}/{}.{ext}",
                self.path
            )
        })
    }
}

/// The primary language of a tag: `en-GB` → `en`.
fn primary(tag: &str) -> &str {
    tag.split(['-', '_']).next().unwrap_or(tag)
}

fn same(a: &str, b: &str) -> bool {
    a.replace('_', "-")
        .eq_ignore_ascii_case(&b.replace('_', "-"))
}

/// Among `tags`, the one that serves the language `wanted`: itself, else
/// the first of the same language (`en` is served by `en-US`, `fr-CA` by
/// `fr`).
pub fn serving<'a>(
    wanted: &str,
    tags: impl IntoIterator<Item = &'a str> + Clone,
) -> Option<&'a str> {
    tags.clone()
        .into_iter()
        .find(|t| same(t, wanted))
        .or_else(|| {
            tags.into_iter()
                .find(|t| primary(t).eq_ignore_ascii_case(primary(wanted)))
        })
}

/// The dictionary offered for the language `wanted`, if there is one.
pub fn offered(wanted: &str) -> Option<&'static Entry> {
    let tag = serving(wanted, CATALOG.iter().map(|e| e.tag))?;
    CATALOG.iter().find(|e| e.tag == tag)
}

/// Why a dictionary could not be installed or read.
#[derive(Debug, thiserror::Error)]
pub enum SpellError {
    /// No dictionary is offered for that language.
    #[error("no dictionary for {0}")]
    Unknown(String),
    /// The dictionary of that language is not installed.
    #[error("the dictionary of {0} is not installed")]
    Missing(String),
    /// It could not be downloaded (what the network said).
    #[error("{0}")]
    Download(String),
    /// What was downloaded, or what is on disk, is not a dictionary.
    #[error("not a dictionary: {0}")]
    Invalid(String),
    /// A file could not be read or written.
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Largest file accepted from the network (the largest of the catalogue is 10 MB).
const MAX_DOWNLOAD: u64 = 48 * 1024 * 1024;

/// Downloads a file of a dictionary. Nothing is sent but the request itself.
pub fn download(url: &str) -> Result<Vec<u8>, SpellError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(120)))
        .user_agent(concat!("raytex/", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    let mut response = agent
        .get(url)
        .call()
        .map_err(|e| SpellError::Download(e.to_string()))?;
    response
        .body_mut()
        .with_config()
        .limit(MAX_DOWNLOAD)
        .read_to_vec()
        .map_err(|e| SpellError::Download(e.to_string()))
}

/// The text of a file of a dictionary: decoded from the encoding its `.aff`
/// file declares (`SET ISO8859-1`), which is then said to be UTF-8.
fn decode(bytes: &[u8], aff: &[u8]) -> String {
    let label = aff
        .split(|b| *b == b'\n')
        .take(200)
        .filter_map(|line| std::str::from_utf8(line).ok())
        .find_map(|line| line.trim().strip_prefix("SET "))
        .map(str::trim)
        .unwrap_or("UTF-8");
    let encoding = encoding_rs::Encoding::for_label(label.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    let (text, _, _) = encoding.decode(bytes);
    text.lines()
        .map(|l| {
            if l.trim_start().starts_with("SET ") {
                "SET UTF-8"
            } else {
                l
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// An installed dictionary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    /// Language tag.
    pub tag: String,
    /// Size on disk, in bytes.
    pub size: u64,
}

/// The dictionaries on this computer, and the words of the user.
#[derive(Debug, Clone)]
pub struct Store {
    dir: PathBuf,
}

impl Store {
    /// The dictionaries kept in `dir` (made at the first installation).
    pub fn at(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn file(&self, tag: &str, ext: &str) -> PathBuf {
        self.dir.join(format!("{tag}.{ext}"))
    }

    /// The dictionaries installed, by tag.
    pub fn installed(&self) -> Vec<Installed> {
        let mut out: Vec<Installed> = std::fs::read_dir(&self.dir)
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                let tag = name.strip_suffix(".dic")?.to_owned();
                let aff = self.file(&tag, "aff");
                let size = e.metadata().ok()?.len() + std::fs::metadata(aff).ok()?.len();
                Some(Installed { tag, size })
            })
            .collect();
        out.sort_by(|a, b| a.tag.cmp(&b.tag));
        out
    }

    /// Installs the dictionary of the catalogue for `tag`: its two files
    /// are fetched with `fetch`, read as a dictionary, and only then written
    /// (under a temporary name first). Returns the tag installed.
    pub fn install(
        &self,
        tag: &str,
        fetch: &dyn Fn(&str) -> Result<Vec<u8>, SpellError>,
    ) -> Result<&'static str, SpellError> {
        let entry = CATALOG
            .iter()
            .find(|e| same(e.tag, tag))
            .ok_or_else(|| SpellError::Unknown(tag.to_owned()))?;
        let [aff_url, dic_url] = entry.urls();
        let aff = fetch(&aff_url)?;
        let dic = fetch(&dic_url)?;
        // What came is a dictionary, or nothing is kept of it.
        spellbook::Dictionary::new(&decode(&aff, &aff), &decode(&dic, &aff))
            .map_err(|e| SpellError::Invalid(e.to_string()))?;
        std::fs::create_dir_all(&self.dir)?;
        for (ext, bytes) in [("aff", &aff), ("dic", &dic)] {
            let to = self.file(entry.tag, ext);
            let tmp = to.with_extension(format!("{ext}.part"));
            std::fs::write(&tmp, bytes)?;
            std::fs::rename(&tmp, &to)?;
        }
        Ok(entry.tag)
    }

    /// Removes an installed dictionary.
    pub fn remove(&self, tag: &str) -> std::io::Result<()> {
        for ext in ["aff", "dic"] {
            match std::fs::remove_file(self.file(tag, ext)) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
                _ => {}
            }
        }
        Ok(())
    }

    /// Reads an installed dictionary.
    pub fn load(&self, tag: &str) -> Result<spellbook::Dictionary, SpellError> {
        let read = |ext: &str| match std::fs::read(self.file(tag, ext)) {
            Ok(bytes) => Ok(bytes),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Err(SpellError::Missing(tag.to_owned()))
            }
            Err(e) => Err(e.into()),
        };
        let aff = read("aff")?;
        let dic = read("dic")?;
        spellbook::Dictionary::new(&decode(&aff, &aff), &decode(&dic, &aff))
            .map_err(|e| SpellError::Invalid(e.to_string()))
    }

    fn words_file(&self) -> PathBuf {
        self.dir.join("words.txt")
    }

    /// The words the user added, in order.
    pub fn words(&self) -> BTreeSet<String> {
        std::fs::read_to_string(self.words_file())
            .unwrap_or_default()
            .lines()
            .map(str::trim)
            .filter(|w| !w.is_empty())
            .map(str::to_owned)
            .collect()
    }

    fn write_words(&self, words: &BTreeSet<String>) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.dir)?;
        let mut text = words.iter().cloned().collect::<Vec<_>>().join("\n");
        if !text.is_empty() {
            text.push('\n');
        }
        crate::settings::write_atomic(&self.words_file(), text.as_bytes())
    }

    /// Adds a word to those of the user.
    pub fn learn(&self, word: &str) -> std::io::Result<()> {
        let mut words = self.words();
        if words.insert(normal(word)) {
            self.write_words(&words)?;
        }
        Ok(())
    }

    /// Takes a word back from those of the user.
    pub fn forget(&self, word: &str) -> std::io::Result<()> {
        let mut words = self.words();
        if words.remove(&normal(word)) {
            self.write_words(&words)?;
        }
        Ok(())
    }
}

/// A word as it is looked up: its typographic apostrophes made plain ones.
fn normal(word: &str) -> String {
    word.trim().replace(['\u{2019}', '\u{02BC}'], "'")
}

/// The words of the user, shared by the checkers of every language.
pub type Personal = Arc<RwLock<BTreeSet<String>>>;

/// A dictionary ready to check words.
pub struct Checker {
    dictionary: spellbook::Dictionary,
    personal: Personal,
}

impl std::fmt::Debug for Checker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Checker").finish_non_exhaustive()
    }
}

impl Checker {
    /// A checker over `dictionary`, with the words of the user.
    pub fn new(dictionary: spellbook::Dictionary, personal: Personal) -> Self {
        Self {
            dictionary,
            personal,
        }
    }

    fn known(&self, word: &str) -> bool {
        self.dictionary.check(word)
            || self
                .personal
                .read()
                .is_ok_and(|p| p.contains(word) || p.contains(&word.to_lowercase()))
    }

    /// Whether a word is spelled right: it is in the dictionary or among
    /// the words of the user, as it is written, or piece by piece for a
    /// word made with hyphens or an apostrophe (`peut-être`, `l'équation`,
    /// `authors'`).
    pub fn check(&self, word: &str) -> bool {
        let word = normal(word);
        let word = word.trim_matches(['\'', '-']);
        if word.is_empty() || self.known(word) {
            return true;
        }
        if word.contains('-')
            && word
                .split('-')
                .all(|part| part.is_empty() || self.check(part))
        {
            return true;
        }
        // An elision: what stands after the apostrophe is the word
        // (`l'`, `d'`, `qu'`…), or the possessive of English after it.
        if let Some((head, tail)) = word.split_once('\'') {
            let head_ok =
                head.chars().count() <= 6 && (self.known(&format!("{head}'")) || self.known(head));
            let tail_ok = tail.is_empty() || tail == "s" || self.known(tail);
            return head_ok && tail_ok;
        }
        false
    }

    /// Up to `max` words the dictionary offers in place of `word`.
    pub fn suggest(&self, word: &str, max: usize) -> Vec<String> {
        let word = normal(word);
        let mut out = Vec::new();
        self.dictionary.suggest(&word, &mut out);
        out.truncate(max);
        out
    }
}

/// The files of a dictionary as a store keeps them, for tests.
#[cfg(test)]
pub(crate) fn write_dictionary(dir: &std::path::Path, tag: &str, aff: &str, dic: &str) {
    std::fs::create_dir_all(dir).unwrap();
    std::fs::write(dir.join(format!("{tag}.aff")), aff).unwrap();
    std::fs::write(dir.join(format!("{tag}.dic")), dic).unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A very small French dictionary: a few words, the plural in `s`, and
    /// the elisions `l'` and `d'` as prefixes.
    const AFF: &str = "SET UTF-8\nTRY esianrtolcdugmphbyfvkwzESIANRTOLCDUGMPHBYFVKWZ'\nWORDCHARS '\n\nSFX S Y 1\nSFX S 0 s [^sxz]\n\nPFX L Y 2\nPFX L 0 l' [aeiouéèêh]\nPFX L 0 d' [aeiouéèêh]\n";
    const DIC: &str =
        "9\nchaleur/S\néquation/SL\ndiffusion/S\nla\nde\nest\npeut-être\nétude/SL\nprofil/S\n";

    fn checker(words: &[&str]) -> Checker {
        let personal: Personal =
            Arc::new(RwLock::new(words.iter().map(|w| (*w).to_owned()).collect()));
        Checker::new(spellbook::Dictionary::new(AFF, DIC).unwrap(), personal)
    }

    #[test]
    fn words_are_checked_as_they_are_written() {
        let c = checker(&["RayTeX"]);
        for right in [
            "chaleur",
            "chaleurs",
            "Chaleur",
            "équation",
            "l'équation",
            "d'équations",
            "l\u{2019}équation",
            "peut-être",
            "diffusion-chaleur",
            "RayTeX",
            "'chaleur'",
            "",
        ] {
            assert!(c.check(right), "{right}");
        }
        for wrong in [
            "chaleure",
            "équasion",
            "l'équasion",
            "diffusion-chaleure",
            "xyzzy",
            "raytexx",
        ] {
            assert!(!c.check(wrong), "{wrong}");
        }
        // What the dictionary offers in place of a word.
        let offered = c.suggest("chaleure", 5);
        assert!(offered.contains(&"chaleur".to_owned()), "{offered:?}");
        assert!(c.suggest("équasion", 5).contains(&"équation".to_owned()));
        assert!(c.suggest("chaleure", 1).len() <= 1);
    }

    #[test]
    fn a_language_is_served_by_its_dictionary_or_one_of_the_same_language() {
        assert_eq!(offered("fr").map(|e| e.tag), Some("fr"));
        assert_eq!(offered("fr-CA").map(|e| e.tag), Some("fr"));
        assert_eq!(offered("en").map(|e| e.tag), Some("en-US"));
        assert_eq!(offered("en-GB").map(|e| e.tag), Some("en-GB"));
        assert_eq!(offered("en_gb").map(|e| e.tag), Some("en-GB"));
        assert_eq!(offered("de-AT").map(|e| e.tag), Some("de-AT"));
        assert_eq!(offered("pt").map(|e| e.tag), Some("pt-PT"));
        assert_eq!(offered("tlh"), None);
        // Among those installed.
        assert_eq!(serving("en-GB", ["fr", "en-US"]), Some("en-US"));
        assert_eq!(serving("en-GB", ["en-US", "en-GB"]), Some("en-GB"));
        assert_eq!(serving("de", ["fr"]), None);
        // Each file is taken at a fixed commit of the repository.
        let [aff, dic] = offered("fr").unwrap().urls();
        assert_eq!(
            aff,
            "https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/fr_FR/dictionaries/fr.aff"
        );
        assert!(dic.ends_with("/fr_FR/dictionaries/fr.dic"));
        let tags: BTreeSet<&str> = CATALOG.iter().map(|e| e.tag).collect();
        assert_eq!(tags.len(), CATALOG.len(), "a tag twice");
    }

    #[test]
    fn a_dictionary_is_installed_only_when_it_is_one() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::at(dir.path().join("dictionaries"));
        assert!(store.installed().is_empty());
        assert!(matches!(store.load("fr"), Err(SpellError::Missing(_))));

        // German is written in ISO 8859-1 in its files.
        let latin1 = |text: &str| text.chars().map(|c| c as u8).collect::<Vec<u8>>();
        let asked = std::cell::RefCell::new(Vec::new());
        let fetch = |url: &str| {
            asked.borrow_mut().push(url.to_owned());
            Ok(if url.ends_with(".aff") {
                latin1("SET ISO8859-1\nTRY esianrtolcdugmphbyfvkwzäöüß\n")
            } else {
                latin1("2\nStraße\nGrün\n")
            })
        };
        assert_eq!(store.install("de", &fetch).unwrap(), "de");
        assert_eq!(asked.borrow().len(), 2);
        assert!(
            asked
                .borrow()
                .iter()
                .all(|u| u.contains("/de/de_DE_frami."))
        );
        assert_eq!(
            store
                .installed()
                .iter()
                .map(|i| i.tag.as_str())
                .collect::<Vec<_>>(),
            ["de"]
        );
        let c = Checker::new(store.load("de").unwrap(), Personal::default());
        assert!(c.check("Straße") && c.check("Grün") && !c.check("Strasse"));

        // What is not a dictionary is not kept; a language nobody offers is refused before any request.
        let garbage = |_: &str| Ok(b"<html>404</html>".to_vec());
        assert!(matches!(
            store.install("fr", &garbage),
            Err(SpellError::Invalid(_))
        ));
        let refused = |_: &str| Err(SpellError::Download("offline".into()));
        assert!(matches!(
            store.install("it", &refused),
            Err(SpellError::Download(_))
        ));
        assert!(matches!(
            store.install("tlh", &refused),
            Err(SpellError::Unknown(_))
        ));
        assert_eq!(store.installed().len(), 1);

        store.remove("de").unwrap();
        store.remove("de").unwrap();
        assert!(store.installed().is_empty());
    }

    #[test]
    fn the_words_of_the_user_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::at(dir.path());
        assert!(store.words().is_empty());
        store.learn("RayTeX").unwrap();
        store.learn(" Dupont ").unwrap();
        store.learn("RayTeX").unwrap();
        assert_eq!(
            store.words().into_iter().collect::<Vec<_>>(),
            ["Dupont", "RayTeX"]
        );
        store.forget("Dupont").unwrap();
        assert_eq!(store.words().into_iter().collect::<Vec<_>>(), ["RayTeX"]);
        write_dictionary(dir.path(), "fr", AFF, DIC);
        let c = Checker::new(
            store.load("fr").unwrap(),
            Arc::new(RwLock::new(store.words())),
        );
        assert!(c.check("RayTeX") && c.check("chaleurs") && !c.check("Dupont"));
    }

    /// The real dictionaries, from the network
    /// (`RAYTEX_ONLINE=1 cargo test -p raytex-core --lib spell -- --ignored`).
    #[test]
    #[ignore = "downloads dictionaries"]
    fn real_dictionaries_are_downloaded_and_check_real_words() {
        if std::env::var_os("RAYTEX_ONLINE").is_none() {
            println!("RAYTEX_ONLINE is not set: nothing downloaded");
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        let store = Store::at(dir.path());
        for (tag, right, wrong) in [
            (
                "fr",
                vec![
                    "équation",
                    "l'équation",
                    "peut-être",
                    "aujourd'hui",
                    "qu'il",
                    "Chaleur",
                    "mémoires",
                    "œuvre",
                ],
                vec!["équasion", "chaleure", "developement"],
            ),
            (
                "en-US",
                vec!["color", "don't", "equations", "author's"],
                vec!["colour", "equasion"],
            ),
            (
                "de",
                vec!["Straße", "Gleichungen", "über"],
                vec!["Gleichunk", "Strase"],
            ),
        ] {
            let start = std::time::Instant::now();
            assert_eq!(store.install(tag, &download).unwrap(), tag);
            let fetched = start.elapsed();
            let start = std::time::Instant::now();
            let c = Checker::new(store.load(tag).unwrap(), Personal::default());
            println!(
                "{tag}: downloaded in {fetched:?}, read in {:?}",
                start.elapsed()
            );
            for w in &right {
                assert!(c.check(w), "{tag}: {w} is right");
            }
            for w in &wrong {
                assert!(!c.check(w), "{tag}: {w} is wrong");
                println!("  {w} → {:?}", c.suggest(w, 5));
            }
            let size = store
                .installed()
                .iter()
                .find(|i| i.tag == tag)
                .unwrap()
                .size;
            assert_eq!(
                size,
                offered(tag).unwrap().size,
                "{tag}: the size the catalogue says"
            );
        }
    }
}

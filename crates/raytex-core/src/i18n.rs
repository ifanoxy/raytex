//! Languages of user-facing messages produced by the engine.

use serde::{Deserialize, Serialize};

/// A supported interface language.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    /// English.
    #[default]
    En,
    /// French.
    Fr,
}

impl Lang {
    /// Picks the French or English variant of a message.
    pub fn pick<'s>(self, fr: &'s str, en: &'s str) -> &'s str {
        match self {
            Lang::Fr => fr,
            Lang::En => en,
        }
    }

    /// Parses a language tag such as `fr`, `fr-FR` or `en_US`.
    pub fn from_tag(tag: &str) -> Self {
        if tag.to_ascii_lowercase().starts_with("fr") {
            Lang::Fr
        } else {
            Lang::En
        }
    }

    /// Two-letter code.
    pub fn code(self) -> &'static str {
        match self {
            Lang::Fr => "fr",
            Lang::En => "en",
        }
    }
}

//! Everything about the TeX installation: finding distributions, indexing
//! their files, learning what any package provides, installing packages and
//! distributions, and the CTAN catalogue.

pub mod ctan;
pub mod discovery;
pub mod manager;
pub mod packages;
pub mod texmf;

pub use discovery::{Distribution, DistroKind, Engine, PackageManager, detect};
pub use packages::{PackageAnalyzer, PackageInfo, Provider, Providers};
pub use texmf::TexmfIndex;

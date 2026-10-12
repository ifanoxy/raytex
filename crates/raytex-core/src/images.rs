//! Images added to a project: file names that LaTeX accepts everywhere,
//! and conversion of SVG drawings to PDF (vector), which every engine reads.
//!
//! Raster formats that LaTeX cannot read (WebP, GIF, HEIC, BMP, TIFF) are
//! converted to PNG by the interface, which already decodes them.

use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use svg2pdf::usvg;

/// Formats read directly by pdfLaTeX, XeLaTeX and LuaLaTeX.
pub const DIRECT: &[&str] = &["pdf", "png", "jpg", "jpeg", "eps", "jbig2", "jb2"];

/// How an image must be prepared before `\includegraphics` can use it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preparation {
    /// Used as is.
    None,
    /// SVG drawing converted to PDF (keeps it vector).
    SvgToPdf,
    /// Raster format converted to PNG (done by the interface).
    ToPng,
}

/// What `path` needs, from its extension.
pub fn preparation(path: &Path) -> Preparation {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    if DIRECT.contains(&ext.as_str()) {
        Preparation::None
    } else if ext == "svg" || ext == "svgz" {
        Preparation::SvgToPdf
    } else {
        Preparation::ToPng
    }
}

fn fold(c: char) -> Option<&'static str> {
    Some(match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => "a",
        'æ' | 'Æ' => "ae",
        'ç' | 'Ç' => "c",
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => "e",
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => "i",
        'ñ' | 'Ñ' => "n",
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => "o",
        'œ' | 'Œ' => "oe",
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => "u",
        'ý' | 'ÿ' | 'Ý' => "y",
        'ß' => "ss",
        _ => return None,
    })
}

/// A file name LaTeX accepts on every system: lowercase ASCII letters,
/// digits and hyphens, one dot before the extension
/// (`Capture d’écran 10.12.png` → `capture-d-ecran-10-12.png`).
pub fn latex_file_name(name: &str) -> String {
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() && !e.is_empty() && e.len() <= 5 => (s, Some(e)),
        _ => (name, None),
    };
    let mut out = String::new();
    for c in stem.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if let Some(f) = fold(c) {
            out.push_str(f);
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let stem = out.trim_matches('-');
    let stem = if stem.is_empty() { "image" } else { stem };
    match ext {
        Some(e) => format!("{stem}.{}", e.to_ascii_lowercase()),
        None => stem.to_owned(),
    }
}

/// `dir/name`, or `dir/name-2`, `dir/name-3`… if it already exists.
pub fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match file_name.rsplit_once('.') {
        Some((s, e)) => (s.to_owned(), format!(".{e}")),
        None => (file_name.to_owned(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}{ext}")))
        .find(|p| !p.exists())
        .expect("an unused name exists")
}

/// Whether an SVG has text, which needs the fonts of the system.
fn has_text(data: &[u8]) -> bool {
    data.windows(5).any(|w| w == b"<text" || w == b":text")
}

/// The fonts of the system, read once: reading them takes seconds on
/// Windows.
fn system_fonts() -> Arc<usvg::fontdb::Database> {
    static FONTS: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    FONTS
        .get_or_init(|| {
            let mut db = usvg::fontdb::Database::new();
            db.load_system_fonts();
            Arc::new(db)
        })
        .clone()
}

/// Converts an SVG drawing to a PDF page of the same size, keeping it vector.
pub fn svg_to_pdf(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut options = usvg::Options::default();
    if has_text(data) {
        options.fontdb = system_fonts();
    }
    let tree = usvg::Tree::from_data(data, &options).map_err(|e| e.to_string())?;
    svg2pdf::to_pdf(
        &tree,
        svg2pdf::ConversionOptions::default(),
        svg2pdf::PageOptions::default(),
    )
    .map_err(|e| e.to_string())
}

// ------------------------------------------------------------ compression

/// How much an image is lightened: how large it may stay, and how finely a
/// photograph is written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compression {
    /// Its longest side at most, in pixels.
    pub max_side: u32,
    /// Quality of a photograph written as JPEG (1 to 100).
    pub quality: u8,
}

impl Compression {
    /// From the lightest touch to the heaviest: the steps tried to bring a
    /// document under a size. 2400 pixels across 16 cm of paper are 380
    /// dots per inch; 1600, 254.
    pub const STEPS: [Compression; 8] = [
        Compression::new(3200, 90),
        Compression::new(2400, 84),
        Compression::new(2000, 78),
        Compression::new(1600, 72),
        Compression::new(1280, 64),
        Compression::new(1024, 56),
        Compression::new(800, 48),
        Compression::new(640, 40),
    ];
    /// Lighter with nothing to see of it, on paper too.
    pub const BALANCED: Compression = Self::STEPS[1];
    /// Much lighter: fine on a screen, a little soft printed large.
    pub const LIGHT: Compression = Self::STEPS[3];

    const fn new(max_side: u32, quality: u8) -> Self {
        Self { max_side, quality }
    }
}

/// The two compressions offered by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompressionLevel {
    /// [`Compression::BALANCED`].
    Balanced,
    /// [`Compression::LIGHT`].
    Light,
}

impl From<CompressionLevel> for Compression {
    fn from(level: CompressionLevel) -> Self {
        match level {
            CompressionLevel::Balanced => Compression::BALANCED,
            CompressionLevel::Light => Compression::LIGHT,
        }
    }
}

/// A lighter copy of an image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Compressed {
    /// The file.
    pub data: Vec<u8>,
    /// Its extension: `jpg` or `png`.
    pub ext: &'static str,
    /// Its size in pixels.
    pub width: u32,
    /// Its size in pixels.
    pub height: u32,
}

/// Whether an image looks like a photograph rather than a drawing, a chart
/// or a capture of a screen: its neighbouring pixels are rarely the same.
/// Flat areas compress well without loss and show the defects of JPEG;
/// photographs are the other way round.
fn photographic(rgb: &image::RgbImage) -> bool {
    let (w, h) = rgb.dimensions();
    if w < 2 || h == 0 {
        return false;
    }
    let step = (h / 256).max(1) as usize;
    let (mut same, mut pairs) = (0u64, 0u64);
    for row in rgb.rows().step_by(step) {
        let mut before: Option<&image::Rgb<u8>> = None;
        for px in row {
            if let Some(b) = before {
                pairs += 1;
                same += u64::from(b == px);
            }
            before = Some(px);
        }
    }
    pairs > 0 && same * 4 < pairs
}

fn encode_jpeg(image: &image::DynamicImage, quality: u8, icc: Option<&[u8]>) -> Option<Vec<u8>> {
    use image::ImageEncoder;
    let mut out = Vec::new();
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality.clamp(1, 100));
    if let Some(icc) = icc {
        let _ = encoder.set_icc_profile(icc.to_vec());
    }
    // JPEG has greys and colours of 8 bits, and no transparency.
    let flat = if image.color().has_color() {
        image::DynamicImage::ImageRgb8(image.to_rgb8())
    } else {
        image::DynamicImage::ImageLuma8(image.to_luma8())
    };
    encoder
        .write_image(
            flat.as_bytes(),
            flat.width(),
            flat.height(),
            flat.color().into(),
        )
        .ok()?;
    Some(out)
}

fn encode_png(image: &image::DynamicImage, icc: Option<&[u8]>) -> Option<Vec<u8>> {
    use image::ImageEncoder;
    use image::codecs::png::{CompressionType, FilterType, PngEncoder};
    let mut out = Vec::new();
    let mut encoder =
        PngEncoder::new_with_quality(&mut out, CompressionType::Best, FilterType::Adaptive);
    if let Some(icc) = icc {
        let _ = encoder.set_icc_profile(icc.to_vec());
    }
    encoder
        .write_image(
            image.as_bytes(),
            image.width(),
            image.height(),
            image.color().into(),
        )
        .ok()?;
    Some(out)
}

/// A PNG or JPEG image read once, to be written at one weight or several.
#[allow(missing_debug_implementations)]
pub struct Picture {
    image: image::DynamicImage,
    /// It came as a JPEG (else a PNG).
    jpeg: bool,
    /// Its colour profile, kept in what is written.
    icc: Option<Vec<u8>>,
    /// Some of it lets what is behind show.
    transparent: bool,
    /// It looks like a photograph (told for a PNG that hides nothing).
    photograph: bool,
    /// Size of the file it was read from.
    len: u64,
}

impl Picture {
    /// Reads an image. `None` for what is not a PNG or a JPEG, for an image
    /// that cannot be read, and for colours made for print (CMYK, which
    /// would not come back the same).
    pub fn read(data: &[u8]) -> Option<Picture> {
        use image::{ImageDecoder, ImageFormat};
        let reader = image::ImageReader::new(std::io::Cursor::new(data))
            .with_guessed_format()
            .ok()?;
        let format = reader.format()?;
        if !matches!(format, ImageFormat::Png | ImageFormat::Jpeg) {
            return None;
        }
        let mut decoder = reader.into_decoder().ok()?;
        if matches!(
            decoder.original_color_type(),
            image::ExtendedColorType::Cmyk8
        ) {
            return None;
        }
        let icc = decoder.icc_profile().ok().flatten();
        let image = image::DynamicImage::from_decoder(decoder).ok()?;
        let jpeg = format == ImageFormat::Jpeg;
        let transparent =
            image.color().has_alpha() && image.to_rgba8().pixels().any(|p| p[3] != 255);
        let photograph = !jpeg && !transparent && photographic(&image.to_rgb8());
        Some(Picture {
            image,
            jpeg,
            icc,
            transparent,
            photograph,
            len: data.len() as u64,
        })
    }

    /// A lighter copy of the image, or `None` when it would not be lighter
    /// than the image is.
    ///
    /// The image is made smaller when its longest side is over
    /// `how.max_side`. A JPEG is written again as a JPEG. A PNG stays a PNG,
    /// without loss, unless it is a photograph without transparency: then it
    /// becomes a JPEG, many times lighter, when `keep_format` allows its
    /// format to change. The colour profile of the image is kept, and its
    /// pixels are not turned (the engines of LaTeX do not read the
    /// orientation a camera notes either).
    pub fn compress(&self, how: Compression, keep_format: bool) -> Option<Compressed> {
        let longest = self.image.width().max(self.image.height());
        let resized = (how.max_side > 0 && longest > how.max_side).then(|| {
            self.image.resize(
                how.max_side,
                how.max_side,
                image::imageops::FilterType::Lanczos3,
            )
        });
        let image = resized.as_ref().unwrap_or(&self.image);
        let (out, ext) = if self.jpeg || (self.photograph && !keep_format) {
            (encode_jpeg(image, how.quality, self.icc.as_deref())?, "jpg")
        } else if image.color().has_alpha() && !self.transparent {
            // An alpha channel that hides nothing is so much weight for nothing.
            let plain = match image {
                image::DynamicImage::ImageRgba16(_) => {
                    image::DynamicImage::ImageRgb16(image.to_rgb16())
                }
                image::DynamicImage::ImageLumaA16(_) => {
                    image::DynamicImage::ImageLuma16(image.to_luma16())
                }
                image::DynamicImage::ImageLumaA8(_) => {
                    image::DynamicImage::ImageLuma8(image.to_luma8())
                }
                other => image::DynamicImage::ImageRgb8(other.to_rgb8()),
            };
            (encode_png(&plain, self.icc.as_deref())?, "png")
        } else {
            (encode_png(image, self.icc.as_deref())?, "png")
        };
        // Not worth a copy that is hardly lighter.
        if out.len() as u64 * 100 >= self.len * 95 {
            return None;
        }
        Some(Compressed {
            data: out,
            ext,
            width: image.width(),
            height: image.height(),
        })
    }
}

/// A lighter copy of a PNG or JPEG image given as the data of its file
/// ([`Picture::read`], then [`Picture::compress`]), or `None` when there is
/// none to make.
pub fn compress(data: &[u8], how: Compression, keep_format: bool) -> Option<Compressed> {
    Picture::read(data)?.compress(how, keep_format)
}

/// Copies `source` into `dir` under a LaTeX-safe name (`name`, or the
/// source's name), converting SVG to PDF. Returns the new file.
pub fn import(source: &Path, dir: &Path, name: Option<&str>) -> Result<PathBuf, String> {
    import_with(source, dir, name, None)
}

/// Writes an image given as data into `dir` under the LaTeX-safe form of
/// `name` (with its extension), made lighter when `compression` says so and
/// there is something to gain: a photograph kept as PNG then becomes a JPEG.
/// Returns the new file.
pub fn import_data(
    data: &[u8],
    dir: &Path,
    name: &str,
    compression: Option<Compression>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let wanted = latex_file_name(name);
    let (stem, ext) = wanted.rsplit_once('.').unwrap_or((wanted.as_str(), "png"));
    let lighter = compression.and_then(|how| compress(data, how, false));
    let (bytes, ext) = match &lighter {
        Some(c) => (c.data.as_slice(), c.ext),
        None => (data, ext),
    };
    let target = unique_path(dir, &format!("{stem}.{ext}"));
    std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(target)
}

/// [`import`], with the image made lighter on the way when `compression`
/// says so (see [`compress`]): what is written in the project is the lighter
/// copy, the image the user chose is not touched.
pub fn import_with(
    source: &Path,
    dir: &Path,
    name: Option<&str>,
    compression: Option<Compression>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let original = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "image".into());
    let wanted = latex_file_name(name.filter(|n| !n.trim().is_empty()).unwrap_or(&original));
    match preparation(source) {
        Preparation::SvgToPdf => {
            let data = std::fs::read(source).map_err(|e| e.to_string())?;
            let data = if source
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("svgz"))
            {
                use std::io::Read;
                let mut out = Vec::new();
                flate2::read::GzDecoder::new(&data[..])
                    .read_to_end(&mut out)
                    .map_err(|e| e.to_string())?;
                out
            } else {
                data
            };
            let pdf = svg_to_pdf(&data)?;
            let stem = wanted.rsplit_once('.').map_or(wanted.as_str(), |(s, _)| s);
            let target = unique_path(dir, &format!("{stem}.pdf"));
            std::fs::write(&target, pdf).map_err(|e| e.to_string())?;
            Ok(target)
        }
        _ => {
            let ext = source
                .extension()
                .map(|e| e.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            let stem = wanted.rsplit_once('.').map_or(wanted.as_str(), |(s, _)| s);
            let file = if ext.is_empty() {
                stem.to_owned()
            } else {
                format!("{stem}.{ext}")
            };
            // Already in place (an image of the project): nothing to copy.
            if source.parent() == Some(dir)
                && source.file_name().is_some_and(|n| n == file.as_str())
            {
                return Ok(source.to_path_buf());
            }
            if let Some(how) = compression
                && matches!(ext.as_str(), "png" | "jpg" | "jpeg")
                && let Ok(data) = std::fs::read(source)
                && let Some(lighter) = compress(&data, how, false)
            {
                let target = unique_path(dir, &format!("{stem}.{}", lighter.ext));
                std::fs::write(&target, lighter.data).map_err(|e| e.to_string())?;
                return Ok(target);
            }
            let target = unique_path(dir, &file);
            std::fs::copy(source, &target).map_err(|e| e.to_string())?;
            Ok(target)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_names() {
        assert_eq!(
            latex_file_name("Capture d’écran 2026-09-27 à 10.12.33.PNG"),
            "capture-d-ecran-2026-09-27-a-10-12-33.png"
        );
        assert_eq!(latex_file_name("Œuvre (finale).jpg"), "oeuvre-finale.jpg");
        assert_eq!(latex_file_name("???.png"), "image.png");
        assert_eq!(latex_file_name("schéma"), "schema");
    }

    /// A picture with the grain of a photograph: no two neighbours alike.
    fn photo(width: u32, height: u32) -> image::RgbImage {
        let mut seed = 0x2545_f491u32;
        image::RgbImage::from_fn(width, height, |x, y| {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let noise = (seed % 24) as u8;
            image::Rgb([
                (x * 200 / width) as u8 + noise,
                (y * 200 / height) as u8 + noise,
                ((x + y) * 100 / (width + height)) as u8 + noise,
            ])
        })
    }

    /// A chart: flat areas of a few colours.
    fn drawing(width: u32, height: u32) -> image::RgbaImage {
        image::RgbaImage::from_fn(width, height, |x, y| {
            if (x / 40 + y / 40) % 2 == 0 {
                image::Rgba([255, 255, 255, 255])
            } else {
                image::Rgba([30, 90, 200, 255])
            }
        })
    }

    fn png(image: &image::DynamicImage) -> Vec<u8> {
        let mut out = std::io::Cursor::new(Vec::new());
        image.write_to(&mut out, image::ImageFormat::Png).unwrap();
        out.into_inner()
    }

    fn size_of(data: &[u8]) -> (image::ImageFormat, u32, u32) {
        let format = image::guess_format(data).unwrap();
        let image = image::load_from_memory(data).unwrap();
        (format, image.width(), image.height())
    }

    #[test]
    fn a_photograph_is_made_smaller_and_written_as_jpeg() {
        let original = png(&image::DynamicImage::ImageRgb8(photo(1200, 800)));
        let how = Compression {
            max_side: 600,
            quality: 80,
        };
        let lighter = compress(&original, how, false).unwrap();
        assert_eq!(
            (lighter.ext, lighter.width, lighter.height),
            ("jpg", 600, 400)
        );
        assert_eq!(size_of(&lighter.data), (image::ImageFormat::Jpeg, 600, 400));
        assert!(
            lighter.data.len() * 10 < original.len(),
            "{} of {}",
            lighter.data.len(),
            original.len()
        );
        // Named with its extension in the document: it stays a PNG, only smaller.
        let kept = compress(&original, how, true).unwrap();
        assert_eq!((kept.ext, kept.width), ("png", 600));
        assert_eq!(size_of(&kept.data).0, image::ImageFormat::Png);
        // A JPEG is written again as a JPEG, lighter at a lower quality.
        let fine = compress(
            &original,
            Compression {
                max_side: 4000,
                quality: 95,
            },
            false,
        )
        .unwrap();
        assert_eq!((fine.ext, fine.width), ("jpg", 1200));
        let coarse = compress(
            &fine.data,
            Compression {
                max_side: 4000,
                quality: 50,
            },
            true,
        )
        .unwrap();
        assert_eq!((coarse.ext, coarse.width), ("jpg", 1200));
        assert!(coarse.data.len() < fine.data.len());
        // Nothing to gain: no copy is made.
        assert_eq!(
            compress(
                &coarse.data,
                Compression {
                    max_side: 4000,
                    quality: 95
                },
                false
            ),
            None
        );
    }

    #[test]
    fn a_drawing_stays_a_png_without_loss() {
        let chart = drawing(1600, 800);
        let original = png(&image::DynamicImage::ImageRgba8(chart.clone()));
        // Larger than asked: made smaller, still a PNG, though its extension could change.
        let lighter = compress(
            &original,
            Compression {
                max_side: 800,
                quality: 60,
            },
            false,
        )
        .unwrap();
        assert_eq!(
            (lighter.ext, lighter.width, lighter.height),
            ("png", 800, 400)
        );
        // Transparency is kept, and with it the format, even for a photograph.
        let mut glass = image::DynamicImage::ImageRgb8(photo(400, 300)).to_rgba8();
        glass.pixels_mut().take(5000).for_each(|p| p[3] = 0);
        let seen_through = compress(
            &png(&image::DynamicImage::ImageRgba8(glass)),
            Compression {
                max_side: 200,
                quality: 60,
            },
            false,
        )
        .unwrap();
        assert_eq!(seen_through.ext, "png");
        let back = image::load_from_memory(&seen_through.data).unwrap();
        assert!(back.color().has_alpha() && back.to_rgba8().pixels().any(|p| p[3] == 0));
        // What is not a PNG or a JPEG is left alone.
        assert_eq!(
            compress(b"%PDF-1.5 not an image", Compression::LIGHT, false),
            None
        );
        assert_eq!(compress(b"", Compression::LIGHT, false), None);
        assert_eq!(compress(&original[..200], Compression::LIGHT, false), None);
    }

    #[test]
    fn an_image_is_made_lighter_on_its_way_into_the_project() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("Photo de l'expérience.PNG");
        let original = png(&image::DynamicImage::ImageRgb8(photo(900, 600)));
        std::fs::write(&src, &original).unwrap();
        let figures = dir.path().join("figures");
        let how = Some(Compression {
            max_side: 450,
            quality: 75,
        });
        // Lighter, and under the extension of what it has become.
        let lighter = import_with(&src, &figures, None, how).unwrap();
        assert_eq!(lighter.file_name().unwrap(), "photo-de-l-experience.jpg");
        assert!(std::fs::metadata(&lighter).unwrap().len() * 5 < original.len() as u64);
        // The image that was chosen is as it was; without compression it is copied whole.
        assert_eq!(std::fs::read(&src).unwrap(), original);
        let whole = import_with(&src, &figures, None, None).unwrap();
        assert_eq!(whole.file_name().unwrap(), "photo-de-l-experience.png");
        assert_eq!(std::fs::read(&whole).unwrap(), original);
        // Pasted data: the same, a second file of the name gets a number.
        let pasted = import_data(&original, &figures, "Photo de l'expérience.png", how).unwrap();
        assert_eq!(pasted.file_name().unwrap(), "photo-de-l-experience-2.jpg");
        let raw = import_data(b"GIF89a...", &figures, "anim.gif", how).unwrap();
        assert_eq!(std::fs::read(&raw).unwrap(), b"GIF89a...");
    }

    #[test]
    fn preparation_by_extension() {
        assert_eq!(preparation(Path::new("a.PNG")), Preparation::None);
        assert_eq!(preparation(Path::new("a.svg")), Preparation::SvgToPdf);
        assert_eq!(preparation(Path::new("a.webp")), Preparation::ToPng);
        assert_eq!(preparation(Path::new("a.heic")), Preparation::ToPng);
    }

    #[test]
    fn imports_with_unique_names_and_converts_svg() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("Mon Schéma.svg");
        std::fs::write(
            &src,
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect x="5" y="5" width="90" height="40" fill="teal"/></svg>"#,
        )
        .unwrap();
        let figures = dir.path().join("figures");
        let pdf = import(&src, &figures, None).unwrap();
        assert_eq!(pdf.file_name().unwrap(), "mon-schema.pdf");
        assert!(std::fs::read(&pdf).unwrap().starts_with(b"%PDF"));
        let png = dir.path().join("photo.png");
        std::fs::write(&png, b"\x89PNG").unwrap();
        let a = import(&png, &figures, Some("Photo 1.png")).unwrap();
        let b = import(&png, &figures, Some("Photo 1.png")).unwrap();
        assert_eq!(a.file_name().unwrap(), "photo-1.png");
        assert_eq!(b.file_name().unwrap(), "photo-1-2.png");
        // An image already in the folder is used where it is.
        assert_eq!(import(&a, &figures, None).unwrap(), a);
    }
}

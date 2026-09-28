// Types mirroring the Rust structures exchanged over IPC.
// Keep in sync with crates/labaguetex-core and crates/labaguetex-desktop.

export type Lang = "fr" | "en";

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  file: string;
  range: Range;
}

// ------------------------------------------------------------- settings

export type AutoBuild = "off" | "onSave" | "onIdle";
export type EngineChoice = "auto" | "pdflatex" | "xelatex" | "lualatex" | "latex" | "tectonic";
export type BuildTool = "auto" | "latexmk" | "single" | "custom";
export type BibTool = "auto" | "biber" | "bibtex" | "none";
export type Engine = "pdflatex" | "xelatex" | "lualatex" | "latex" | "tectonic";

export interface CustomStep {
  name: string;
  program: string;
  args: string[];
}

export interface Macro {
  name: string;
  trigger: string;
  key: string;
  body: string;
  math: boolean;
}

export interface Settings {
  /** Format version (migrations are done by the engine). */
  version: number;
  general: {
    language: "system" | "fr" | "en";
    theme: "system" | "light" | "dark";
    restoreSession: boolean;
    beginnerTips: boolean;
    hideAuxFiles: boolean;
    /** Folder of the projects (null: `labaguetex` in the documents folder). */
    projectsDir: string | null;
  };
  editor: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    tabSize: number;
    useTabs: boolean;
    wordWrap: boolean;
    lineNumbers: boolean;
    highlightActiveLine: boolean;
    autoCloseBrackets: boolean;
    autoCloseEnvironments: boolean;
    mathPreview: boolean;
    hoverDocs: boolean;
    spellcheck: boolean;
    vimMode: boolean;
    autoSave: boolean;
    autoSaveDelayMs: number;
    folding: boolean;
    showWhitespace: boolean;
  };
  build: {
    engine: EngineChoice;
    tool: BuildTool;
    bibTool: BibTool;
    autoBuild: AutoBuild;
    autoBuildDelayMs: number;
    outDir: string;
    synctex: boolean;
    shellEscape: boolean;
    haltOnError: boolean;
    extraArgs: string[];
    customSteps: CustomStep[];
    timeoutS: number;
    distribution: string | null;
    extraBinDirs: string[];
    showBadboxes: boolean;
    miktexAutoInstall: boolean;
    copyPdfToRoot: boolean;
    /** Precompiled preambles (pdfLaTeX): faster passes. */
    precompilePreamble: boolean;
  };
  viewer: {
    syncAfterBuild: boolean;
    invertInDark: boolean;
    defaultZoom: string;
    doubleClickSync: boolean;
  };
  completion: {
    enabled: boolean;
    autoAddPackage: boolean;
    atShortcuts: boolean;
    snippets: boolean;
    learnFromPackages: boolean;
  };
  lint: {
    enabled: boolean;
    styleHints: boolean;
    disabledRules: string[];
  };
  macros: Macro[];
  keybindings: Record<string, string>;
}

/** labaguetex.toml (snake_case, as written in the file). */
export interface ProjectConfig {
  project: { name?: string | null; main?: string | null; language?: string | null };
  build: {
    engine?: EngineChoice | null;
    tool?: BuildTool | null;
    bib_tool?: BibTool | null;
    out_dir?: string | null;
    shell_escape?: boolean | null;
    extra_args?: string[] | null;
    custom_steps?: CustomStep[] | null;
    copy_pdf_to_root?: boolean | null;
  };
  lint: { disabled_rules: string[] };
}

// -------------------------------------------------------------- session

export interface RecentProject {
  path: string;
  name: string;
  openedAt: number;
  /** A file opened on its own (light mode). */
  light: boolean;
}

/** A project of the projects folder. */
export interface ProjectEntry {
  path: string;
  name: string;
  main: string | null;
  /** Last change of its sources (seconds since the epoch). */
  modified: number;
  /** Its PDF, when built. */
  pdf: string | null;
}

export interface ProjectsOverview {
  dir: string;
  projects: ProjectEntry[];
  recent: RecentProject[];
}

export interface Session {
  recent: RecentProject[];
  lastProject: string | null;
  /** The last one was a file opened on its own. */
  lastLight: boolean;
  openFiles: Record<string, string[]>;
  activeFile: Record<string, string>;
}

export interface AppInfo {
  version: string;
  os: "macos" | "windows" | "linux" | string;
  arch: string;
  settingsPath: string;
  templatesPath: string;
}

// -------------------------------------------------------------- project

export interface ProjectInfo {
  root: string;
  name: string;
  main: string | null;
  candidates: string[];
  config: ProjectConfig;
  configError: string | null;
  initialFile: string | null;
  openFiles: string[];
  /** A file opened on its own (light mode): no project folder. */
  light: boolean;
}

export interface FileNode {
  name: string;
  path: string;
  dir: boolean;
  children?: FileNode[];
}

export interface Doc {
  en: string;
  fr: string;
}

export interface TemplateInfo {
  id: string;
  name: Doc;
  description: Doc;
  category: "general" | "student" | "teacher" | "researcher" | "user" | string;
  order: number;
  main: string;
  engine: string | null;
  tags: string[];
  user: boolean;
}

export interface TemplateValues {
  title: string;
  author: string;
  institution: string;
  language: string;
}

/** A template applied to the open project. */
export interface AppliedTemplate {
  /** New text of the main file (put in the editor: undoable). */
  mainText: string;
  /** Other files written into the project. */
  created: string[];
  /** Files of the template that existed already (left untouched). */
  kept: string[];
  /** Engine required by the template (`lualatex`…), null for pdfLaTeX. */
  engine: string | null;
}

export interface TextFile {
  text: string;
  lossy: boolean;
  modified: number;
}

// ---------------------------------------------------------- diagnostics

export type Severity = "error" | "warning" | "info" | "hint";
export type DiagnosticSource = "latex" | "bibtex" | "biber" | "index" | "syntax" | "lint" | "build";

/** One change of a multi-place fix (absolute path). */
export interface FileEdit {
  file: string;
  range: Range;
  text: string;
}

export type Fix =
  | { kind: "addPackage"; package: string; options?: string }
  | { kind: "addPackageOption"; package: string; option: string }
  | { kind: "addToPreamble"; title: string; code: string; after?: string }
  | { kind: "addTikzLibrary"; library: string }
  | { kind: "installPackage"; file: string }
  | { kind: "replace"; title: string; range: Range; text: string }
  | { kind: "edits"; title: string; edits: FileEdit[] }
  | { kind: "useEngine"; engine: string }
  | { kind: "enableShellEscape" }
  | { kind: "createFile"; path: string }
  | { kind: "rebuild" }
  | { kind: "openDoc"; package: string };

export interface Diagnostic {
  severity: Severity;
  source: DiagnosticSource;
  code: string | null;
  message: string;
  file: string | null;
  range: Range | null;
  line: number | null;
  endLine: number | null;
  contextBefore: string | null;
  contextAfter: string | null;
  raw: string | null;
  hint: { title: string; explanation: string } | null;
  fixes: Fix[];
}

export interface DocumentUpdate {
  version: number;
  diagnostics: Diagnostic[];
  root: string;
}

// ----------------------------------------------------------- completion

export type ItemKind =
  | "command"
  | "environment"
  | "label"
  | "citation"
  | "package"
  | "class"
  | "file"
  | "color"
  | "snippet"
  | "macro"
  | "symbol"
  | "option"
  | "keyword"
  | "glossary";

export interface CompletionItem {
  label: string;
  kind: ItemKind;
  detail?: string;
  apply: string;
  snippet: boolean;
  boost: number;
  info?: string;
  glyph?: string;
  addPackage?: string;
  color?: string;
  /** `@` shortcut typing the same thing (`@a` for `\alpha`). */
  shortcut?: string;
}

export interface CompletionList {
  from: number;
  toAfter: number;
  validFor: string | null;
  filter: boolean;
  /** Only the best items were sent: ask again on the next keystroke. */
  incomplete: boolean;
  items: CompletionItem[];
}

export type HoverView =
  | { kind: "html"; html: string; range: Range }
  | { kind: "image"; path: string; range: Range };

export interface TextEdit {
  file: string;
  range: Range;
  newText: string;
}

export interface MathAt {
  latex: string;
  display: boolean;
  range: Range;
  macros: Record<string, string>;
}

// ------------------------------------------------------------ structure

export type SectionKind = "part" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph" | "subparagraph" | "frame";

export interface OutlineItem {
  kind: SectionKind;
  level: number;
  title: string;
  starred: boolean;
  number: string | null;
  location: Location;
}

export type LabelKind =
  | { type: "section" }
  | { type: "figure" }
  | { type: "table" }
  | { type: "equation" }
  | { type: "theorem"; name: string }
  | { type: "item" }
  | { type: "listing" }
  | { type: "algorithm" }
  | { type: "frame" }
  | { type: "other" };

export interface LabelItem {
  name: string;
  kind: LabelKind;
  context: string | null;
  resolved: { number: string; page: string } | null;
  location: Location;
}

export interface CitationItem {
  key: string;
  kind: string;
  authors: string;
  year: string;
  title: string;
  venue: string;
  location: Location;
}

export interface TodoItem {
  tag: string;
  text: string;
  location: Location;
}

export interface Structure {
  root: string;
  outline: OutlineItem[];
  labels: LabelItem[];
  citations: CitationItem[];
  todos: TodoItem[];
}

export interface SearchMatch {
  location: Location;
  lineText: string;
}

export interface WordCount {
  words: number;
  characters: number;
  headings: number;
  inlineMath: number;
  displayMath: number;
  figures: number;
  tables: number;
  citations: number;
}

// ---------------------------------------------------------------- build

export interface BuildPlan {
  root: string;
  job: string;
  rootDir: string;
  outDir: string;
  engine: Engine;
  engineReason: string;
  tool: BuildTool;
  bibTool: BibTool | null;
  pdf: string;
  log: string;
  synctex: string;
}

export interface StepSummary {
  name: string;
  durationMs: number;
  exitCode: number | null;
}

export interface BuildOutcome {
  success: boolean;
  cancelled: boolean;
  pdf: string | null;
  pdfUpdated: boolean;
  durationMs: number;
  diagnostics: Diagnostic[];
  pages: number | null;
  steps: StepSummary[];
  missingFiles: string[];
  engine: Engine;
  plan: BuildPlan;
}

export interface OutputLine {
  stream: "stdout" | "stderr";
  text: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ForwardView {
  pdf: string;
  page: number;
  rects: Rect[];
}

export interface InverseResult {
  file: string;
  line: number;
}

// ------------------------------------------------------------------ TeX

export type DistroKind = "texlive" | "mactex" | "tinytex" | "systemtexlive" | "miktex" | "tectonic" | "other";

export type PackageManager =
  | { kind: "tlmgr"; path: string; writable: boolean }
  | { kind: "miktex"; path: string; modern: boolean }
  | { kind: "automatic" }
  | { kind: "system"; tool: string }
  | { kind: "none" };

export interface Distribution {
  id: string;
  kind: DistroKind;
  name: string;
  version: string | null;
  binDir: string;
  tools: Record<string, string>;
  engines: Engine[];
  packageManager: PackageManager;
}

export interface TexStatus {
  detected: boolean;
  detecting: boolean;
  indexing: boolean;
  distributions: Distribution[];
  active: string | null;
  installedPackages: number;
}

export interface Cmd {
  program: string;
  args: string[];
  cwd: string | null;
  env: [string, string][];
  pathPrefix: string[];
}

export interface Plan {
  steps: Cmd[];
  needsAdmin: boolean;
  note: Doc;
}

export interface DistroOption {
  id: string;
  name: string;
  description: Doc;
  size: string;
  recommended: boolean;
  needsAdmin: boolean;
  command: Cmd | null;
  url: string;
  notes: Doc;
}

export type JobRequest =
  | { kind: "installDistribution"; option: string }
  | { kind: "installPackages"; packages?: string[]; files?: string[]; userMode?: boolean }
  | { kind: "removePackages"; packages: string[] }
  | { kind: "updateAll" };

export interface RepositoryPackage {
  name: string;
  description: string;
  installed: boolean;
}

export interface PackageView {
  name: string;
  class: boolean;
  installed: boolean;
  path: string | null;
  summary: string | null;
  provides: string | null;
  commands: string[];
  environments: string[];
  options: string[];
  requires: string[];
  documented: number;
}

export interface CatalogEntry {
  key: string;
  name: string;
  caption: string;
}

export interface CtanDetails {
  id: string;
  name: string;
  caption: string;
  description: string;
  version: string | null;
  license: string | null;
  documentation: { label: string; url: string }[];
  home: string | null;
  repository: string | null;
  texlive: string | null;
  miktex: string | null;
  topics: string[];
  ctanUrl: string;
}

// ----------------------------------------------------------------- help

export interface PageInfo {
  id: string;
  title: string;
}

export interface ReferenceEntry {
  label: string;
  environment: boolean;
  package: string | null;
  args: string;
  doc: string;
  glyph: string | null;
  insert: string;
}

export interface SymbolCategory {
  id: string;
  name: string;
  symbols: { command: string; glyph: string; package: string | null; math: boolean }[];
}

export interface ErrorEntry {
  id: string;
  title: string;
  explanation: string;
}

export interface SnippetView {
  trigger: string;
  name: string;
  body: string;
  math: boolean;
  package: string | null;
}

// ------------------------------------------------------- media / previews

export interface PreviewOutcome {
  pdf: string | null;
  /** Bounding box of the first TikZ picture, in TeX points: [left, bottom, right, top]. */
  bbox: [number, number, number, number] | null;
  /** Border added by `standalone`, in points. */
  border: number;
  /** `line` is relative to the body. */
  diagnostics: Diagnostic[];
  durationMs: number;
  engine: Engine;
}

export interface SnippetRequest {
  path: string;
  job: string;
  classOptions: string;
  projectPreamble: boolean;
  packages?: string[];
  libraries?: string[];
  extra?: string;
  body: string;
  engine?: Engine | null;
}

export interface FontFace {
  path: string;
  index: number;
  family: string;
  postscript: string;
  weight: number;
  italic: boolean;
  monospace: boolean;
}

export interface FontFamily {
  name: string;
  monospace: boolean;
  faces: FontFace[];
}

export type FontRole = "main" | "sans" | "mono" | "math" | "command";

export interface TexFont {
  id: string;
  name: string;
  package: string;
  options: string;
  kind: "serif" | "sans" | "mono";
  math: boolean;
  fontspec: string | null;
  extra: string;
  description: string;
  code: string;
}

export interface TikzTemplate {
  id: string;
  category: string;
  name: string;
  description: string;
  packages: string[];
  libraries: string[];
  preamble: string;
  code: string;
}

//! Running external programs (TeX engines, package managers, texdoc…).
//!
//! * Output is streamed line by line (lossily decoded: TeX may print
//!   bytes that are not UTF-8).
//! * Cancellation kills the whole process tree (latexmk spawns engines).
//! * On Windows no console window flashes; on Unix the child gets its own
//!   process group.
//! * `PATH` is extended with the TeX distribution's `bin` directory, since
//!   GUI applications often start with a minimal `PATH`.

use std::ffi::OsString;
use std::io::{self, BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::Serialize;

/// A command line to run.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cmd {
    /// Program (absolute path or name looked up in `PATH`).
    pub program: PathBuf,
    /// Arguments.
    pub args: Vec<String>,
    /// Working directory.
    pub cwd: Option<PathBuf>,
    /// Extra environment variables.
    pub env: Vec<(String, String)>,
    /// Directories prepended to `PATH`.
    pub path_prefix: Vec<PathBuf>,
}

impl Cmd {
    /// A command without arguments.
    pub fn new(program: impl Into<PathBuf>) -> Self {
        Self {
            program: program.into(),
            ..Self::default()
        }
    }

    /// Appends an argument.
    pub fn arg(mut self, a: impl Into<String>) -> Self {
        self.args.push(a.into());
        self
    }

    /// Appends arguments.
    pub fn args<I: IntoIterator<Item = S>, S: Into<String>>(mut self, a: I) -> Self {
        self.args.extend(a.into_iter().map(Into::into));
        self
    }

    /// Sets the working directory.
    pub fn cwd(mut self, dir: impl Into<PathBuf>) -> Self {
        self.cwd = Some(dir.into());
        self
    }

    /// Adds an environment variable.
    pub fn env(mut self, k: impl Into<String>, v: impl Into<String>) -> Self {
        self.env.push((k.into(), v.into()));
        self
    }

    /// Prepends a directory to `PATH`.
    pub fn path_prefix(mut self, dir: impl Into<PathBuf>) -> Self {
        self.path_prefix.push(dir.into());
        self
    }

    /// Human-readable command line (for logs and confirmations).
    pub fn display(&self) -> String {
        let mut s = quote(&self.program.to_string_lossy());
        for a in &self.args {
            s.push(' ');
            s.push_str(&quote(a));
        }
        s
    }

    /// Builds the [`std::process::Command`].
    pub fn to_command(&self) -> Command {
        let mut c = Command::new(&self.program);
        c.args(&self.args);
        if let Some(cwd) = &self.cwd {
            c.current_dir(cwd);
        }
        for (k, v) in &self.env {
            c.env(k, v);
        }
        if !self.path_prefix.is_empty() {
            let current = std::env::var_os("PATH").unwrap_or_default();
            let mut paths: Vec<PathBuf> = self.path_prefix.clone();
            paths.extend(std::env::split_paths(&current));
            if let Ok(joined) = std::env::join_paths(paths) {
                c.env("PATH", joined);
            }
        }
        c.stdin(Stdio::null());
        platform_setup(&mut c);
        c
    }
}

fn quote(s: &str) -> String {
    if s.is_empty() || s.contains(|c: char| c.is_whitespace() || "\"'$`\\;&|<>()".contains(c)) {
        format!("'{}'", s.replace('\'', "'\\''"))
    } else {
        s.to_owned()
    }
}

#[cfg(windows)]
fn platform_setup(c: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    c.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(unix)]
fn platform_setup(c: &mut Command) {
    use std::os::unix::process::CommandExt;
    c.process_group(0);
}

#[cfg(not(any(unix, windows)))]
fn platform_setup(_: &mut Command) {}

/// Output of a finished command.
#[derive(Debug, Clone, Default)]
pub struct Output {
    /// Exit code (`None` if killed by a signal or cancelled).
    pub code: Option<i32>,
    /// Captured standard output.
    pub stdout: String,
    /// Captured standard error.
    pub stderr: String,
    /// Whether the command was cancelled or timed out.
    pub cancelled: bool,
}

impl Output {
    /// Exit code 0.
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }
}

/// Which stream a line comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Stream {
    /// Standard output.
    Stdout,
    /// Standard error.
    Stderr,
}

/// Runs a command to completion and captures its output (with a timeout).
pub fn output(cmd: &Cmd, timeout: Duration) -> io::Result<Output> {
    let never = AtomicBool::new(false);
    let mut out = Output::default();
    let status = run_streaming(cmd, &never, Some(timeout), |stream, line| {
        let buf = match stream {
            Stream::Stdout => &mut out.stdout,
            Stream::Stderr => &mut out.stderr,
        };
        buf.push_str(line);
        buf.push('\n');
    })?;
    out.code = status.code;
    out.cancelled = status.cancelled;
    Ok(out)
}

/// Exit status of a streamed command.
#[derive(Debug, Clone, Copy, Default)]
pub struct Status {
    /// Exit code.
    pub code: Option<i32>,
    /// Cancelled by the caller or timed out.
    pub cancelled: bool,
}

/// Runs a command, calling `on_line` for every output line, until it exits,
/// `cancel` becomes true or `timeout` elapses (then the process tree is killed).
pub fn run_streaming(
    cmd: &Cmd,
    cancel: &AtomicBool,
    timeout: Option<Duration>,
    mut on_line: impl FnMut(Stream, &str),
) -> io::Result<Status> {
    let mut command = cmd.to_command();
    command.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn()?;
    let (tx, rx) = mpsc::channel::<(Stream, String)>();
    let readers: Vec<_> = [
        child
            .stdout
            .take()
            .map(|s| (Stream::Stdout, Box::new(s) as Box<dyn Read + Send>)),
        child
            .stderr
            .take()
            .map(|s| (Stream::Stderr, Box::new(s) as Box<dyn Read + Send>)),
    ]
    .into_iter()
    .flatten()
    .map(|(stream, reader)| {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(reader);
            let mut buf = Vec::with_capacity(256);
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        while buf.last().is_some_and(|b| *b == b'\n' || *b == b'\r') {
                            buf.pop();
                        }
                        if tx
                            .send((stream, String::from_utf8_lossy(&buf).into_owned()))
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
        })
    })
    .collect();
    drop(tx);

    let start = Instant::now();
    let mut cancelled = false;
    loop {
        match rx.recv_timeout(Duration::from_millis(40)) {
            Ok((stream, line)) => on_line(stream, &line),
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        let timed_out = timeout.is_some_and(|t| start.elapsed() > t);
        if !cancelled && (cancel.load(Ordering::Relaxed) || timed_out) {
            cancelled = true;
            kill_tree(&mut child);
        }
    }
    for r in readers {
        let _ = r.join();
    }
    let status = child.wait()?;
    Ok(Status {
        code: if cancelled { None } else { status.code() },
        cancelled,
    })
}

/// Kills a child and all its descendants.
pub fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    {
        let pid = child.id() as i32;
        signal_group(pid);
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
}

#[cfg(unix)]
#[allow(unsafe_code)]
fn signal_group(pid: i32) {
    // SAFETY: `kill` has no memory-safety preconditions; a negative pid
    // targets the process group created with `process_group(0)`.
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(150));
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
}

/// Wraps a command so that it runs with administrator rights, asking the
/// user for authorisation through the operating system's own dialog.
pub fn elevated(cmd: &Cmd) -> Cmd {
    let path_prefix: Vec<String> = cmd
        .path_prefix
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if cfg!(target_os = "macos") {
        let mut line = String::new();
        if !path_prefix.is_empty() {
            line.push_str(&format!("PATH={}:$PATH ", quote(&path_prefix.join(":"))));
        }
        line.push_str(&cmd.display());
        let script = format!(
            "do shell script \"{}\" with administrator privileges",
            line.replace('\\', "\\\\").replace('"', "\\\"")
        );
        Cmd {
            program: "osascript".into(),
            args: vec!["-e".into(), script],
            cwd: cmd.cwd.clone(),
            ..Cmd::default()
        }
    } else if cfg!(windows) {
        let args = cmd
            .args
            .iter()
            .map(|a| format!("'{}'", a.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(",");
        let script = format!(
            "Start-Process -FilePath '{}' -ArgumentList {} -Verb RunAs -Wait",
            cmd.program.to_string_lossy().replace('\'', "''"),
            if args.is_empty() {
                "@()".to_owned()
            } else {
                args
            }
        );
        Cmd::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", &script])
    } else {
        let mut args = Vec::new();
        if !path_prefix.is_empty() {
            args.push("env".to_owned());
            let current = std::env::var("PATH").unwrap_or_default();
            args.push(format!("PATH={}:{current}", path_prefix.join(":")));
        }
        args.push(cmd.program.to_string_lossy().into_owned());
        args.extend(cmd.args.iter().cloned());
        Cmd {
            program: "pkexec".into(),
            args,
            cwd: cmd.cwd.clone(),
            ..Cmd::default()
        }
    }
}

/// Executable file name on this platform (`pdflatex` → `pdflatex.exe` on Windows).
pub fn exe_name(name: &str) -> String {
    if cfg!(windows) && !name.ends_with(".exe") {
        format!("{name}.exe")
    } else {
        name.to_owned()
    }
}

/// File names a tool may have on this platform: on Windows `pdflatex.exe`,
/// and the scripts some distributions use (`tlmgr.bat` in TeX Live).
pub fn exe_names(name: &str) -> Vec<String> {
    if cfg!(windows) && Path::new(name).extension().is_none() {
        ["exe", "bat", "cmd"]
            .iter()
            .map(|ext| format!("{name}.{ext}"))
            .collect()
    } else {
        vec![name.to_owned()]
    }
}

/// The tool called `name` in `dir`, if it is there.
pub fn executable_in(dir: &Path, name: &str) -> Option<PathBuf> {
    exe_names(name)
        .into_iter()
        .map(|f| dir.join(f))
        .find(|p| is_executable(p))
}

/// Looks for an executable in `dirs`, then in `PATH`.
pub fn find_executable(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    dirs.iter()
        .cloned()
        .chain(std::env::split_paths(&path))
        .find_map(|d| executable_in(&d, name))
}

/// Whether `path` is an executable file.
pub fn is_executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}

/// `PATH` as seen by the user's login shell (GUI apps on macOS/Linux do not
/// inherit it). Returns an empty list on Windows or on failure.
pub fn login_shell_path() -> Vec<PathBuf> {
    if cfg!(windows) {
        return Vec::new();
    }
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| OsString::from("/bin/sh"));
    let cmd = Cmd::new(PathBuf::from(shell)).args(["-ilc", "printf '__LBT__%s__LBT__' \"$PATH\""]);
    let Ok(out) = output(&cmd, Duration::from_secs(3)) else {
        return Vec::new();
    };
    let Some(start) = out.stdout.find("__LBT__") else {
        return Vec::new();
    };
    let rest = &out.stdout[start + 7..];
    let Some(end) = rest.find("__LBT__") else {
        return Vec::new();
    };
    std::env::split_paths(&rest[..end]).collect()
}

#[cfg(test)]
mod tests {

    #[test]
    #[cfg(windows)]
    fn windows_tools_can_be_scripts() {
        // TeX Live's tlmgr is tlmgr.bat on Windows.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("tlmgr.bat"), "@echo off\n").unwrap();
        std::fs::write(dir.path().join("pdflatex.exe"), "").unwrap();
        assert_eq!(
            executable_in(dir.path(), "tlmgr"),
            Some(dir.path().join("tlmgr.bat"))
        );
        assert_eq!(
            executable_in(dir.path(), "pdflatex"),
            Some(dir.path().join("pdflatex.exe"))
        );
        assert_eq!(executable_in(dir.path(), "biber"), None);
    }

    use super::*;

    #[cfg(unix)]
    #[test]
    fn streams_and_cancels() {
        let cmd = Cmd::new("/bin/sh").args(["-c", "echo one; echo two >&2; printf 'caf\\351\\n'"]);
        let out = output(&cmd, Duration::from_secs(5)).unwrap();
        assert!(out.success());
        assert_eq!(out.stdout, "one\ncaf\u{FFFD}\n");
        assert_eq!(out.stderr, "two\n");

        let slow = Cmd::new("/bin/sh").args(["-c", "sleep 30"]);
        let t = Instant::now();
        let out = output(&slow, Duration::from_millis(200)).unwrap();
        assert!(out.cancelled);
        assert!(t.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn display_quotes() {
        let c = Cmd::new("tlmgr").args(["install", "my pkg"]);
        assert_eq!(c.display(), "tlmgr install 'my pkg'");
    }
}

// The number of the largest window on screen whose application's name
// contains the argument (scripts/e2e.mjs, E2E_WINDOW: pictures of that
// window alone, rounded corners transparent, nothing in front of it).
import CoreGraphics

let name = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : "raytex"
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var best: (number: Int, area: Double)?
for w in windows where (w[kCGWindowLayer as String] as? Int) == 0 {
  guard let owner = (w[kCGWindowOwnerName as String] as? String)?.lowercased(), owner.contains(name),
        let number = w[kCGWindowNumber as String] as? Int else { continue }
  let bounds = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
  let area = (bounds["Width"] ?? 0) * (bounds["Height"] ?? 0)
  if area > (best?.area ?? 0) { best = (number, area) }
}
if let best { print(best.number) }

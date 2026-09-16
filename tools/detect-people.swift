import Foundation
import Vision
import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("[]"); exit(1) }
let req = VNDetectHumanRectanglesRequest(); req.upperBodyOnly = false
let h = VNImageRequestHandler(cgImage: cg, options: [:]); try h.perform([req])
let W = Double(cg.width), H = Double(cg.height)
var out: [String] = []
for r in req.results ?? [] { let b = r.boundingBox
  out.append(String(format: "[%.0f,%.0f,%.0f,%.0f,%.2f]", b.minX*W, (1-b.maxY)*H, b.maxX*W, (1-b.minY)*H, r.confidence)) }
print("[" + out.joined(separator: ",") + "]")

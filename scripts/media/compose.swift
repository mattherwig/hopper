// Composites a window capture (PNG without shadow, from `screencapture -o -l`) onto a 2000x1250
// gradient background, the size Raycast requires for Store screenshots.
// Usage: swift compose.swift <window.png> <out.png>
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
  FileHandle.standardError.write("usage: compose.swift <window.png> <out.png>\n".data(using: .utf8)!)
  exit(2)
}

let canvas = NSSize(width: 2000, height: 1250)
let out = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: Int(canvas.width), pixelsHigh: Int(canvas.height), bitsPerSample: 8,
  samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: out)

// Background: diagonal purple gradient to match the extension icon, plus a soft glow behind the window.
let rect = NSRect(origin: .zero, size: canvas)
NSGradient(
  colors: [
    NSColor(srgbRed: 0.18, green: 0.09, blue: 0.40, alpha: 1),
    NSColor(srgbRed: 0.42, green: 0.25, blue: 0.78, alpha: 1),
    NSColor(srgbRed: 0.80, green: 0.52, blue: 0.93, alpha: 1),
  ])!.draw(in: rect, angle: -35)
NSGradient(colors: [NSColor(white: 1, alpha: 0.18), NSColor(white: 1, alpha: 0)])!
  .draw(in: rect, relativeCenterPosition: NSPoint(x: 0, y: 0.1))

// Window: 75% of the canvas width, centered, so padding is ~12.5% on every side. Raycast's CI
// (scripts/check_raycast_images.py in raycast/extensions) requires 8-17% padding with top/bottom
// and left/right within 4% of each other. The capture has no system shadow (`screencapture -o`);
// draw a soft one here with no offset so it stays symmetric.
// Crop to the visible pixels first: with the action panel open, the capture carries extra
// transparent margin that would otherwise shrink and shift the window.
guard let bitmap = NSBitmapImageRep(data: try! Data(contentsOf: URL(fileURLWithPath: args[1]))) else { exit(2) }
var minX = bitmap.pixelsWide, minY = bitmap.pixelsHigh, maxX = -1, maxY = -1
for y in 0..<bitmap.pixelsHigh {
  for x in 0..<bitmap.pixelsWide where (bitmap.colorAt(x: x, y: y)?.alphaComponent ?? 0) > 0.5 {
    minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
  }
}
guard maxX >= minX, let cropped = bitmap.cgImage?.cropping(
  to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1))
else { exit(2) }
let windowImage = NSImage(cgImage: cropped, size: NSSize(width: cropped.width, height: cropped.height))

let px = NSSize(width: cropped.width, height: cropped.height)
let scale = min(canvas.width * 0.75 / px.width, canvas.height * 0.76 / px.height)
let size = NSSize(width: (px.width * scale).rounded(), height: (px.height * scale).rounded())
let origin = NSPoint(x: ((canvas.width - size.width) / 2).rounded(), y: ((canvas.height - size.height) / 2).rounded())
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = NSColor(white: 0, alpha: 0.35)
shadow.shadowBlurRadius = 40
shadow.shadowOffset = .zero
shadow.set()
windowImage.draw(in: NSRect(origin: origin, size: size), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()

NSGraphicsContext.current = nil
try! out.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))

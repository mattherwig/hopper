// Regenerates assets/extension-icon.png (512x512). Run: swift scripts/make-icon.swift
import AppKit

let size: CGFloat = 512
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let ctx = NSGraphicsContext.current!.cgContext

// Rounded-square background with a diagonal gradient.
let inset: CGFloat = 32
let rect = CGRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2)
let bg = CGPath(roundedRect: rect, cornerWidth: 100, cornerHeight: 100, transform: nil)
ctx.addPath(bg)
ctx.clip()
let colors = [NSColor(srgbRed: 0.38, green: 0.36, blue: 0.98, alpha: 1).cgColor,
              NSColor(srgbRed: 0.14, green: 0.55, blue: 0.98, alpha: 1).cgColor] as CFArray
let gradient = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: colors, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: size), end: CGPoint(x: size, y: 0), options: [])

// Two chevrons: a bold "back" and a lighter "forward".
func chevron(centerX: CGFloat, pointsLeft: Bool, alpha: CGFloat) {
  let h: CGFloat = 150, w: CGFloat = 75
  let dir: CGFloat = pointsLeft ? -1 : 1
  let path = CGMutablePath()
  path.move(to: CGPoint(x: centerX - dir * w / 2, y: size / 2 + h / 2))
  path.addLine(to: CGPoint(x: centerX + dir * w / 2, y: size / 2))
  path.addLine(to: CGPoint(x: centerX - dir * w / 2, y: size / 2 - h / 2))
  ctx.addPath(path)
  ctx.setStrokeColor(NSColor.white.withAlphaComponent(alpha).cgColor)
  ctx.setLineWidth(46)
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  ctx.strokePath()
}
chevron(centerX: size / 2 - 80, pointsLeft: true, alpha: 1)
chevron(centerX: size / 2 + 80, pointsLeft: false, alpha: 0.55)

image.unlockFocus()
let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets/extension-icon.png")
let scaled = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 512, pixelsHigh: 512, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: scaled)
image.draw(in: NSRect(x: 0, y: 0, width: 512, height: 512))
NSGraphicsContext.restoreGraphicsState()
try! scaled.representation(using: .png, properties: [:])!.write(to: out)
print("wrote \(out.path)")

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

enum ReplayExporter {
    static func export(board: Board, path: [Coordinate], speed: Int) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("autocombo-\(UUID().uuidString).gif")
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.gif.identifier as CFString, max(2, path.count), nil) else { throw NSError(domain: "AutoCombo.Export", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to create GIF."]) }
        let delay = max(0.02, min(0.5, 100.0 / Double(max(1, speed)) / 100.0))
        let frames = path.isEmpty ? [board] : path.indices.map { frameBoard(board: board, path: path, index: $0) }
        for frame in frames {
            guard let image = draw(frame) else { continue }
            let options: [CFString: Any] = [kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFDelayTime: delay]]
            CGImageDestinationAddImage(destination, image, options as CFDictionary)
        }
        guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "AutoCombo.Export", code: 2, userInfo: [NSLocalizedDescriptionKey: "GIF export failed."]) }
        return url
    }

    private static func frameBoard(board: Board, path: [Coordinate], index: Int) -> Board {
        guard let current = path[safe: index] else { return board }
        var copy = board
        if index > 0, let previous = path[safe: index - 1] { let temp = copy[previous]; copy[previous] = copy[current]; copy[current] = temp }
        copy[current].mark = .end
        return copy
    }

    private static func draw(_ board: Board) -> CGImage? {
        let size = 480
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.setFillColor(CGColor(gray: 0.04, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: size, height: size))
        let cell = CGFloat(size) / CGFloat(Board.cols)
        for row in 0..<Board.rows {
            for col in 0..<Board.cols {
                let coordinate = Coordinate(row: row, col: col)
                let rect = CGRect(x: CGFloat(col) * cell, y: CGFloat(Board.rows - 1 - row) * cell, width: cell, height: cell).insetBy(dx: 2, dy: 2)
                let shade = 0.12 + CGFloat((row + col) % 2) * 0.04
                context.setFillColor(CGColor(red: shade, green: shade, blue: shade + 0.02, alpha: 1)); context.fill(rect)
                guard let orb = board[coordinate].orb else { continue }
                context.setFillColor(orbColor(orb)); context.fillEllipse(in: rect.insetBy(dx: cell * 0.12, dy: cell * 0.12))
                if board[coordinate].mark != .none { context.setStrokeColor(CGColor(gray: 1, alpha: 0.9)); context.setLineWidth(3); context.stroke(rect.insetBy(dx: cell * 0.22, dy: cell * 0.22)) }
            }
        }
        return context.makeImage()
    }

    private static func orbColor(_ orb: Orb) -> CGColor {
        switch orb { case .water: return CGColor(red: 0.16, green: 0.62, blue: 0.95, alpha: 1); case .fire: return CGColor(red: 0.95, green: 0.23, blue: 0.20, alpha: 1); case .earth: return CGColor(red: 0.18, green: 0.76, blue: 0.35, alpha: 1); case .light: return CGColor(red: 0.98, green: 0.79, blue: 0.14, alpha: 1); case .dark: return CGColor(red: 0.53, green: 0.30, blue: 0.82, alpha: 1); case .heart: return CGColor(red: 0.96, green: 0.30, blue: 0.58, alpha: 1) }
    }
}

private extension Array {
    subscript(safe index: Index) -> Element? { indices.contains(index) ? self[index] : nil }
}

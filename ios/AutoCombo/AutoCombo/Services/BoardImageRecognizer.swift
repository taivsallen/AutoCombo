import UIKit

struct BoardImageRecognizer {
    struct Result {
        let board: Board
        let confidence: Double
    }

    static func recognize(_ image: UIImage) -> Result? {
        guard let cgImage = image.cgImage else { return nil }
        let width = cgImage.width
        let height = cgImage.height
        guard width > 20, height > 20 else { return nil }

        var cells: [[BoardCell]] = []
        var confidence = 0.0
        for row in 0..<Board.rows {
            var current: [BoardCell] = []
            for col in 0..<Board.cols {
                let x = min(width - 1, max(0, Int((Double(col) + 0.5) * Double(width) / Double(Board.cols))))
                let y = min(height - 1, max(0, Int((Double(row) + 0.5) * Double(height) / Double(Board.rows))))
                let rgb = pixel(in: cgImage, x: x, y: y)
                let classified = classify(rgb)
                current.append(BoardCell(orb: classified.orb))
                confidence += classified.confidence
            }
            cells.append(current)
        }
        return Result(board: Board(cells: cells), confidence: confidence / Double(Board.rows * Board.cols))
    }

    private static func pixel(in image: CGImage, x: Int, y: Int) -> (CGFloat, CGFloat, CGFloat, CGFloat) {
        guard let provider = image.dataProvider, let data = provider.data, let pointer = CFDataGetBytePtr(data) else {
            return (0.2, 0.2, 0.2, 1)
        }
        let components = image.bitsPerPixel / 8
        let offset = y * image.bytesPerRow + x * components
        let r = CGFloat(pointer[offset]) / 255
        let g = CGFloat(pointer[offset + min(1, components - 1)]) / 255
        let b = CGFloat(pointer[offset + min(2, components - 1)]) / 255
        let a = components > 3 ? CGFloat(pointer[offset + 3]) / 255 : 1
        return (r, g, b, a)
    }

    private static func classify(_ rgb: (CGFloat, CGFloat, CGFloat, CGFloat)) -> (orb: Orb, confidence: Double) {
        let (r, g, b, _) = rgb
        let maxValue = max(r, max(g, b))
        let minValue = min(r, min(g, b))
        let saturation = maxValue == 0 ? 0 : Double((maxValue - minValue) / maxValue)
        if maxValue < 0.18 { return (.dark, 0.35) }
        if saturation < 0.18 { return (.heart, 0.28) }

        if b > r * 1.18 && b > g * 1.05 { return (.water, min(1, 0.55 + saturation * 0.4)) }
        if r > g * 1.22 && r > b * 1.18 { return (.fire, min(1, 0.55 + saturation * 0.4)) }
        if g > r * 1.12 && g > b * 1.08 { return (.earth, min(1, 0.5 + saturation * 0.45)) }
        if r > 0.55 && g > 0.48 && b < 0.42 { return (.light, min(1, 0.5 + saturation * 0.35)) }
        if r > b * 1.05 && b > g * 0.85 { return (.heart, min(1, 0.45 + saturation * 0.3)) }
        return (.dark, 0.3)
    }
}

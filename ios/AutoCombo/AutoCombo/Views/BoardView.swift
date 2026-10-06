import SwiftUI

struct BoardGrid: View {
    @ObservedObject var model: AutoComboViewModel
    var editable = false
    var board: Board?
    private var displayBoard: Board { board ?? model.board }
    private var route: [Coordinate] { model.currentPath }

    init(model: AutoComboViewModel, editable: Bool = false, board: Board? = nil) { self.model = model; self.editable = editable; self.board = board }

    var body: some View {
        GeometryReader { geometry in
            let cellSize = geometry.size.width / CGFloat(Board.cols)
            ZStack {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: Board.cols), spacing: 0) {
                    ForEach(0..<Board.rows, id: \.self) { row in
                        ForEach(0..<Board.cols, id: \.self) { col in
                            let coordinate = Coordinate(row: row, col: col)
                            BoardCellView(cell: displayBoard[coordinate], coordinate: coordinate)
                                .frame(width: cellSize, height: cellSize)
                                .contentShape(Rectangle())
                                .onTapGesture { if editable { model.editCell(coordinate) } }
                                .accessibilityAddTraits(editable ? AccessibilityTraits.isButton : AccessibilityTraits())
                                .accessibilityLabel(accessibilityLabel(for: displayBoard[coordinate], coordinate: coordinate))
                        }
                    }
                }
                Canvas { context, size in
                    guard route.count > 1 else { return }
                    var line = Path()
                    for (index, point) in route.enumerated() {
                        let x = (CGFloat(point.col) + 0.5) * size.width / CGFloat(Board.cols)
                        let y = (CGFloat(point.row) + 0.5) * size.height / CGFloat(Board.rows)
                        if index == 0 { line.move(to: CGPoint(x: x, y: y)) } else { line.addLine(to: CGPoint(x: x, y: y)) }
                    }
                    context.stroke(line, with: .color(.white.opacity(0.95)), style: StrokeStyle(lineWidth: max(3, cellSize * 0.07), lineCap: .round, lineJoin: .round))
                    if let first = route.first { context.fill(Path(ellipseIn: CGRect(x: (CGFloat(first.col) + 0.2) * cellSize, y: (CGFloat(first.row) + 0.2) * cellSize, width: cellSize * 0.6, height: cellSize * 0.6)), with: .color(.green)) }
                    if let last = route.last { context.fill(Path(ellipseIn: CGRect(x: (CGFloat(last.col) + 0.16) * cellSize, y: (CGFloat(last.row) + 0.16) * cellSize, width: cellSize * 0.68, height: cellSize * 0.68)), with: .color(.red)) }
                }.allowsHitTesting(false)
            }
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
            .contentShape(Rectangle())
            .simultaneousGesture(DragGesture(minimumDistance: 0).onChanged { value in
                guard !editable else { return }
                let coordinate = coordinate(at: value.location, cellSize: cellSize)
                if model.isManualDragging { model.continueManual(to: coordinate) } else { model.beginManual(at: coordinate) }
            }.onEnded { _ in if !editable { model.endManual() } })
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 620)
    }

    private func coordinate(at location: CGPoint, cellSize: CGFloat) -> Coordinate { Coordinate(row: min(Board.rows - 1, max(0, Int(location.y / cellSize))), col: min(Board.cols - 1, max(0, Int(location.x / cellSize)))) }
    private func accessibilityLabel(for cell: BoardCell, coordinate: Coordinate) -> String { "Row \(coordinate.row + 1), column \(coordinate.col + 1), \(cell.orb?.name ?? \"empty\"), \(cell.mark.label)" }
}

struct BoardCellView: View {
    let cell: BoardCell
    let coordinate: Coordinate
    var body: some View {
        ZStack {
            ((coordinate.row + coordinate.col).isMultiple(of: 2) ? Color(white: 0.16) : Color(white: 0.09))
            if let orb = cell.orb { Image(orb.assetName).resizable().scaledToFit().padding(1).shadow(color: orb.tint.opacity(0.35), radius: 5) } else { Color.black.opacity(0.45) }
            if cell.mark != .none {
                RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(cell.mark.color, lineWidth: 3).padding(4)
                Text(cell.mark.label).font(.system(size: 10, weight: .black, design: .rounded)).foregroundStyle(cell.mark.color).padding(3).background(.black.opacity(0.72), in: Capsule()).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).padding(4)
            }
        }.overlay(Rectangle().stroke(Color.white.opacity(0.08), lineWidth: 0.5))
    }
}

struct StatStrip: View {
    @ObservedObject var model: AutoComboViewModel
    var body: some View {
        HStack(spacing: 8) {
            StatItem(title: "Max", value: "\(model.stats.theoreticalMax)", color: .gray)
            StatItem(title: "Combos", value: model.stats.skyfallCombos > 0 ? "\(model.stats.combos)+\(model.stats.skyfallCombos)" : "\(model.stats.combos)", color: .cyan)
            StatItem(title: "Cleared", value: model.stats.skyfallCleared > 0 ? "\(model.stats.initialCleared)+\(model.stats.skyfallCleared)" : "\(model.stats.initialCleared)", color: .purple)
            StatItem(title: "Steps", value: "\(model.stats.steps)", color: .green)
        }
    }
}

private struct StatItem: View {
    let title: String; let value: String; let color: Color
    var body: some View { VStack(spacing: 4) { Text(title).font(.caption2.weight(.bold)).foregroundStyle(color.opacity(0.8)); Text(value).font(.title3.monospacedDigit().weight(.black)).foregroundStyle(color) }.frame(maxWidth: .infinity, minHeight: 60).background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 14, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(color.opacity(0.2), lineWidth: 1)) }
}

struct ActionButton: View {
    let title: String; let systemImage: String; var tint: Color = .white; var disabled = false; let action: () -> Void
    var body: some View { Button(action: action) { Label(title, systemImage: systemImage).font(.subheadline.weight(.bold)).frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.borderedProminent).tint(tint).foregroundStyle(.white).disabled(disabled).accessibilityLabel(title) }
}

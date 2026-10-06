import SwiftUI

struct BoardEditorView: View {
    @ObservedObject var model: AutoComboViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    BoardGrid(model: model, editable: true, board: model.editorBoard)
                    toolPicker
                    HStack(spacing: 10) {
                        Button { model.editorBoard = Board.random(seed: model.settings.boardSeed &+ 99) } label: { Label("Random board", systemImage: "shuffle") }
                        Button { model.clearEditorMarks() } label: { Label("Clear marks", systemImage: "eraser") }
                    }.buttonStyle(.bordered)
                    Text("Tap a cell to apply the selected tool. Confirm imported images before applying.").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(16)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Edit board")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Apply") { model.saveEditor(); dismiss() }.fontWeight(.bold) } }
        }.preferredColorScheme(.dark)
    }

    private var toolPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Orbs").font(.subheadline.weight(.black))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 8) {
                ForEach(Orb.allCases) { orb in
                    Button { model.editorTool = .orb(orb) } label: { VStack(spacing: 3) { Image(orb.assetName).resizable().scaledToFit().frame(height: 37); Text(orb.name).font(.caption2.weight(.bold)) }.frame(maxWidth: .infinity, minHeight: 62).background(isOrbSelected(orb) ? orb.tint.opacity(0.24) : .white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(isOrbSelected(orb) ? orb.tint : .clear, lineWidth: 2)) }.buttonStyle(.plain)
                }
            }
            Text("Marks").font(.subheadline.weight(.black)).padding(.top, 4)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 8) {
                ForEach(CellMark.allCases) { mark in
                    Button { model.editorTool = .mark(mark) } label: { Text(mark.label).font(.caption.weight(.black)).frame(maxWidth: .infinity, minHeight: 42).background(isMarkSelected(mark) ? mark.color.opacity(0.25) : .white.opacity(0.06), in: RoundedRectangle(cornerRadius: 11)).overlay(RoundedRectangle(cornerRadius: 11).stroke(isMarkSelected(mark) ? mark.color : .clear, lineWidth: 2)) }.buttonStyle(.plain)
                }
                Button { model.editorTool = .empty } label: { Label("Empty", systemImage: "square.dashed").font(.caption.weight(.black)).frame(maxWidth: .infinity, minHeight: 42).background(isEmptySelected ? Color.gray.opacity(0.25) : .white.opacity(0.06), in: RoundedRectangle(cornerRadius: 11)) }.buttonStyle(.plain)
            }
        }.padding(12).background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 18))
    }

    private func isOrbSelected(_ orb: Orb) -> Bool { if case .orb(let selected) = model.editorTool { return selected == orb }; return false }
    private func isMarkSelected(_ mark: CellMark) -> Bool { if case .mark(let selected) = model.editorTool { return selected == mark }; return false }
    private var isEmptySelected: Bool { if case .empty = model.editorTool { return true }; return false }
}

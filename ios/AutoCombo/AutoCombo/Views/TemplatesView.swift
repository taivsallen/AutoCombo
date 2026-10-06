import SwiftUI

struct TemplatesView: View {
    @ObservedObject var model: AutoComboViewModel
    @Environment(\.dismiss) private var dismiss
    private let templates: [(String, String, Board)] = [
        ("Balanced", "Six attributes in a mixed board", .sample()),
        ("Cross practice", "Water cross near the center", Board(cells: [
            [.fire, .earth, .water, .light, .dark, .heart],
            [.fire, .fire, .water, .fire, .dark, .heart],
            [.earth, .earth, .water, .earth, .light, .light],
            [.fire, .water, .water, .water, .dark, .dark],
            [.heart, .heart, .earth, .light, .light, .fire],
            [.dark, .water, .fire, .earth, .heart, .water]
        ])),
        ("Short route", "A compact test for steps-first mode", Board(cells: [
            [.water, .water, .fire, .earth, .light, .dark],
            [.water, .fire, .fire, .earth, .light, .dark],
            [.earth, .earth, .heart, .heart, .dark, .dark],
            [.light, .light, .water, .fire, .fire, .earth],
            [.heart, .heart, .water, .water, .fire, .earth],
            [.dark, .light, .light, .heart, .earth, .water]
        ]))
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(templates, id: \.0) { item in
                        Button {
                            model.useTemplate(item.2)
                            model.saveEditor()
                            dismiss()
                        } label: {
                            HStack(spacing: 14) {
                                BoardGrid(model: model, board: item.2).frame(width: 100, height: 100).allowsHitTesting(false)
                                VStack(alignment: .leading, spacing: 5) { Text(item.0).font(.headline.weight(.black)); Text(item.1).font(.caption).foregroundStyle(.secondary); Label("Apply template", systemImage: "arrow.down.doc").font(.caption.weight(.bold)).foregroundStyle(.cyan) }
                                Spacer()
                            }.padding(12).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 18))
                        }.buttonStyle(.plain)
                    }
                }.padding(16)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Board templates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }.preferredColorScheme(.dark)
    }
}

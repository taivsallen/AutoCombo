import SwiftUI

struct SettingsView: View {
    @ObservedObject var model: AutoComboViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    SettingsCard(title: "Search and replay", icon: "wand.and.stars") { searchSection }
                    SettingsCard(title: "Shield and special goals", icon: "shield.lefthalf.filled") { specialSection }
                    SettingsCard(title: "Clear rules and requirements", icon: "list.number") { ruleSection }
                    SettingsCard(title: "Privacy", icon: "lock.shield") { Text("Board state and settings are stored locally. Image recognition is performed on-device. No account or server is required.").font(.caption).foregroundStyle(.secondary) }
                }
                .padding(14)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { model.persist(); dismiss() }.fontWeight(.bold) } }
        }
        .preferredColorScheme(.dark)
    }

    private var searchSection: some View {
        VStack(spacing: 13) {
            HStack { Label("Target combo", systemImage: "target"); Spacer(); Text("\(model.settings.targetCombo)").font(.headline.monospacedDigit().weight(.black)).foregroundStyle(.cyan) }
            Slider(value: Binding(get: { Double(model.settings.targetCombo) }, set: { model.settings.targetCombo = Int($0.rounded()); model.markDirty() }), in: 1...15, step: 1).tint(.cyan)
            Picker("Performance", selection: Binding(get: { model.settings.performanceLevel }, set: { model.settings.applyPerformance($0); model.markDirty() })) { ForEach(1...5, id: \.self) { Text("Level \($0)").tag($0) } }.pickerStyle(.segmented)
            Text("Higher levels search more states and may use more battery. Search runs away from the UI thread.").font(.caption).foregroundStyle(.secondary)
            HStack { Label("Replay speed", systemImage: "speedometer"); Slider(value: Binding(get: { Double(model.settings.replaySpeed) }, set: { model.settings.replaySpeed = Int($0.rounded()); model.persist() }), in: 10...90, step: 5).tint(.indigo) }
            Toggle("Include top buffer row", isOn: Binding(get: { model.settings.row0Enabled }, set: { model.settings.row0Enabled = $0; model.markDirty() }))
        }
    }

    private var specialSection: some View {
        VStack(spacing: 10) { ForEach(model.specials.indices, id: \.self) { index in specialRow(index) } }
    }

    private func specialRow(_ index: Int) -> some View {
        let binding = specialBinding(index)
        return VStack(spacing: 8) {
            HStack { Text("Goal \(index + 1)").font(.subheadline.weight(.black)); Spacer(); Picker("Type", selection: binding.type) { ForEach(SpecialType.allCases) { Text($0.title).tag($0) } }.labelsHidden().pickerStyle(.menu) }
            if binding.wrappedValue.type != .none {
                HStack {
                    if binding.wrappedValue.type != .equalFirst && binding.wrappedValue.type != .clearCount && binding.wrappedValue.type != .rectangle { Stepper("Count \(binding.wrappedValue.count)", value: binding.count, in: 1...9) }
                    if binding.wrappedValue.type == .clearCount { Stepper("First clear \(binding.wrappedValue.clearCount)", value: binding.clearCount, in: 1...30) }
                    if binding.wrappedValue.type == .rectangle { Stepper("Rows \(binding.wrappedValue.rectRows)", value: binding.rectRows, in: 3...5); Stepper("Cols \(binding.wrappedValue.rectCols)", value: binding.rectCols, in: 3...5) }
                }
                if binding.wrappedValue.type == .equalFirst {
                    Text("Select attributes that must have equal group counts.").font(.caption.weight(.bold)).frame(maxWidth: .infinity, alignment: .leading)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 6) {
                        ForEach(Orb.allCases) { orb in
                            let selected = binding.wrappedValue.equalOrbs.contains(orb)
                            Button { toggleEqualOrb(index, orb) } label: { Image(orb.assetName).resizable().scaledToFit().frame(height: 28).padding(5).background(selected ? orb.tint.opacity(0.25) : .white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8)) }.buttonStyle(.plain)
                        }
                    }
                } else if binding.wrappedValue.type != .clearCount {
                    Picker("Attribute", selection: binding.orb) { Text("Any").tag(Optional<Orb>.none); ForEach(Orb.allCases) { Text($0.name).tag(Optional($0)) } }.pickerStyle(.menu)
                }
            }
        }
        .padding(11).background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
    }

    private var ruleSection: some View {
        VStack(spacing: 10) {
            ForEach(Orb.allCases) { orb in
                let binding = ruleBinding(orb)
                HStack(spacing: 8) {
                    Image(orb.assetName).resizable().scaledToFit().frame(width: 30, height: 30)
                    Text(orb.name).font(.subheadline.weight(.bold)).frame(width: 48, alignment: .leading)
                    Picker("Minimum", selection: binding.minimum) { ForEach(1...5, id: \.self) { Text("\($0) orbs").tag($0) } }.pickerStyle(.menu)
                    Picker("Mode", selection: binding.mode) { ForEach(ClearMode.allCases) { Text($0.title).tag($0) } }.pickerStyle(.menu)
                }
            }
            Divider().overlay(.white.opacity(0.12))
            HStack { Text("Specific requirements").font(.subheadline.weight(.black)); Spacer(); Button { model.addRequirement() } label: { Label("Add", systemImage: "plus.circle.fill") }.font(.caption.weight(.bold)) }
            ForEach(model.rules.requirements.indices, id: \.self) { index in requirementRow(index) }
            if model.rules.requirements.isEmpty { Text("No additional requirements.").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading) }
        }
    }

    private func requirementRow(_ index: Int) -> some View {
        let binding = requirementBinding(index)
        return HStack(spacing: 5) {
            Picker("Orb", selection: binding.orb) { ForEach(Orb.allCases) { Text($0.name).tag($0) } }.pickerStyle(.menu)
            Picker("Size", selection: binding.size) { ForEach(1...5, id: \.self) { Text("\($0)").tag($0) } }.pickerStyle(.menu)
            Stepper("x\(binding.wrappedValue.count)", value: binding.count, in: 1...9).labelsHidden()
            Picker("Match", selection: binding.match) { ForEach(RequirementMatch.allCases) { Text($0.title).tag($0) } }.pickerStyle(.menu)
            Button(role: .destructive) { model.removeRequirement(at: index) } label: { Image(systemName: "trash") }.accessibilityLabel("Delete requirement")
        }
        .font(.caption.weight(.bold)).padding(8).background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
    }

    private func specialBinding(_ index: Int) -> Binding<SpecialPriority> { Binding(get: { model.specials[index] }, set: { model.specials[index] = $0; model.markDirty() }) }
    private func ruleBinding(_ orb: Orb) -> Binding<OrbRule> { Binding(get: { model.rules.orbRules[orb.rawValue] }, set: { model.rules.orbRules[orb.rawValue] = $0; model.markDirty() }) }
    private func requirementBinding(_ index: Int) -> Binding<RuleRequirement> { Binding(get: { model.rules.requirements[index] }, set: { model.rules.requirements[index] = $0; model.markDirty() }) }
    private func toggleEqualOrb(_ index: Int, _ orb: Orb) { var item = model.specials[index]; if item.equalOrbs.contains(orb) { item.equalOrbs.removeAll { $0 == orb } } else { item.equalOrbs.append(orb) }; model.specials[index] = item; model.markDirty() }
}

private struct SettingsCard<Content: View>: View {
    let title: String
    let icon: String
    let content: Content
    init(title: String, icon: String, @ViewBuilder content: () -> Content) { self.title = title; self.icon = icon; self.content = content() }
    var body: some View { VStack(alignment: .leading, spacing: 12) { Label(title, systemImage: icon).font(.headline.weight(.black)).foregroundStyle(.cyan); content }.padding(14).background(.white.opacity(0.055), in: RoundedRectangle(cornerRadius: 20, style: .continuous)).overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Color.white.opacity(0.1), lineWidth: 1)) }
}

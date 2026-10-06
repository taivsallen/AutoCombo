import Foundation

struct PersistedState: Codable {
    var board: Board
    var settings: SolverSettings
    var rules: RuleProfile
    var specials: [SpecialPriority]
    var language: AppLanguage
    var manualMode: Bool
    var showTopBuffer: Bool
}

final class PersistenceStore {
    private let key = "autocombo.persisted-state.v1"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func load() -> PersistedState? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(PersistedState.self, from: data)
    }

    func save(_ state: PersistedState) {
        guard let data = try? JSONEncoder().encode(state) else { return }
        defaults.set(data, forKey: key)
    }
}

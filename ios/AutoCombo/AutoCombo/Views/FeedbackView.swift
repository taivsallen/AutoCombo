import SwiftUI
import UIKit

struct FeedbackView: View {
    let language: AppLanguage
    @Environment(\.dismiss) private var dismiss
    @State private var message = ""
    @State private var email = ""
    @State private var sent = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Issue") { TextEditor(text: $message).frame(minHeight: 140).accessibilityLabel("Issue description") }
                Section("Contact (optional)") { TextField("Email", text: $email).textInputAutocapitalization(.never).keyboardType(.emailAddress) }
                Section {
                    Button { sendFeedback() } label: { Label(sent ? "Mail opened" : "Create feedback email", systemImage: sent ? "checkmark.circle.fill" : "paperplane.fill").frame(maxWidth: .infinity) }.disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } footer: { Text("This opens the system mail app. No board or token is uploaded automatically.") }
            }
            .navigationTitle("Report issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }.preferredColorScheme(.dark)
    }

    private func sendFeedback() {
        let body = "Language: \(language.title)\nContact: \(email)\n\n\(message)"
        let subject = "AutoCombo iOS Feedback"
        let encodedSubject = subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? subject
        let encodedBody = body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? body
        if let url = URL(string: "mailto:?subject=\(encodedSubject)&body=\(encodedBody)"), UIApplication.shared.canOpenURL(url) { UIApplication.shared.open(url); sent = true }
    }
}

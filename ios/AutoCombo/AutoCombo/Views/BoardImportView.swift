import SwiftUI
import PhotosUI
import UIKit

struct BoardImportView: View {
    @ObservedObject var model: AutoComboViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var showCamera = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if model.isImporting { ProgressView("Recognizing board...").frame(maxWidth: .infinity, minHeight: 110) }
                    else { BoardGrid(model: model, editable: true, board: model.editorBoard) }
                    HStack(spacing: 10) {
                        PhotosPicker(selection: $selectedItem, matching: .images) { Label("Choose image", systemImage: "photo.on.rectangle").frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.borderedProminent).tint(.cyan)
                        Button { showCamera = true } label: { Label("Camera", systemImage: "camera.fill").frame(maxWidth: .infinity, minHeight: 48) }.buttonStyle(.bordered)
                    }
                    if let confidence = model.importConfidence { Label("Confidence \(Int(confidence * 100)) percent. Verify every cell.", systemImage: confidence > 0.65 ? "checkmark.seal.fill" : "exclamationmark.triangle.fill").font(.caption.weight(.bold)).foregroundStyle(confidence > 0.65 ? .green : .orange).frame(maxWidth: .infinity, alignment: .leading) }
                    Text("Use a complete front-facing 6x6 board image. Recognition is local and can be corrected in the editor.").font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }.padding(16)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Import board")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }; ToolbarItem(placement: .confirmationAction) { Button("Apply") { model.saveEditor(); dismiss() }.fontWeight(.bold) } }
        }
        .preferredColorScheme(.dark)
        .sheet(isPresented: $showCamera) { CameraPicker { image in showCamera = false; if let image { model.importImage(image) } }.ignoresSafeArea() }
        .onChange(of: selectedItem) { _, item in
            guard let item else { return }
            Task { if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) { model.importImage(image) } }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    let completion: (UIImage?) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(completion: completion) }
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    final class Coordinator: NSObject, UINavigationControllerDelegate, UIImagePickerControllerDelegate {
        let completion: (UIImage?) -> Void
        init(completion: @escaping (UIImage?) -> Void) { self.completion = completion }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { completion(info[.originalImage] as? UIImage); picker.dismiss(animated: true) }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { completion(nil); picker.dismiss(animated: true) }
    }
}

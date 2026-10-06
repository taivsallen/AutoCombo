plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val mainSolverSource = rootProject.file("../../src/App.jsx")
val mainSolverGenerator = rootProject.file("../../tools/generate_android_appjsx_solver.mjs")
val solverBundleGenerator = rootProject.file("../../tools/generate_android_solver_bundle.mjs")
val androidSolverAsset = project.file("src/main/assets/solverCore.js")
val androidRecognitionAsset = project.file("src/main/assets/recognitionCore.js")
val androidSolverBundleAsset = project.file("src/main/assets/appjsxSolverBundle.js")

tasks.register("syncMainSolverCore") {
    inputs.file(mainSolverSource)
    inputs.file(mainSolverGenerator)
    outputs.file(androidSolverAsset)
    doLast {
        exec {
            workingDir = rootProject.file("../..")
            commandLine("node", mainSolverGenerator.absolutePath, mainSolverSource.absolutePath, androidSolverAsset.absolutePath)
        }
    }
}

tasks.register("syncMainSolverBundle") {
    dependsOn("syncMainSolverCore")
    inputs.file(androidSolverAsset)
    inputs.file(androidRecognitionAsset)
    inputs.file(solverBundleGenerator)
    outputs.file(androidSolverBundleAsset)
    doLast {
        exec {
            workingDir = rootProject.file("../..")
            commandLine(
                "node",
                solverBundleGenerator.absolutePath,
                androidSolverAsset.absolutePath,
                androidRecognitionAsset.absolutePath,
                androidSolverBundleAsset.absolutePath
            )
        }
    }
}

android {
    namespace = "com.comboauto"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.comboauto.android"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }
}

tasks.matching { it.name == "preBuild" }.configureEach {
    dependsOn("syncMainSolverBundle")
}

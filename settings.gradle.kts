pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "WifiScanner"

// 순수 Kotlin(JVM) 파서 모듈. Android SDK 없이도 단독으로 빌드·테스트할 수 있도록 included build로 둔다.
includeBuild("wifiparser")
include(":app")

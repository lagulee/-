plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

// 루트에서 ./gradlew test 를 실행하면 파서 테스트도 함께 실행한다.
tasks.register("test") {
    dependsOn(gradle.includedBuild("wifiparser").task(":test"))
}

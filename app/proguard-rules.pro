# 릴리스 빌드에서는 모든 android.util.Log 호출을 제거한다.
# (앱 코드는 원래 로그를 남기지 않지만, 실수로 추가되더라도 비밀번호가 로그에 남지 않도록 한다.)
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
    public static *** wtf(...);
    public static *** println(...);
}

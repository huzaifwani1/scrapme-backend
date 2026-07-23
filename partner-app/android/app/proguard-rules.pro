# Project-specific ProGuard / R8 Rules for ScrapMe Partner Application

# Keep Capacitor Native Bridge and Plugins
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public *;
}

# Preserve WebView JavaScript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve stack traces for crash reporting
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod

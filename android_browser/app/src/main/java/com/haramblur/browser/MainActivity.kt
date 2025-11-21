package com.haramblur.browser

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Create WebView programmatically to avoid layout XML for simplicity
        webView = WebView(this)
        setContentView(webView)

        // Configure WebView
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        
        // Load Injection Script
        val injectionScript = loadInjectionScript()

        // Set WebViewClient
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                injectScript(view, injectionScript)
            }
        }

        // Load a default page (e.g., Google or a test page)
        webView.loadUrl("https://www.google.com")
    }

    private fun loadInjectionScript(): String {
        return try {
            val inputStream = assets.open("haramblur.js")
            val reader = BufferedReader(InputStreamReader(inputStream))
            val sb = StringBuilder()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                sb.append(line).append("\n")
            }
            reader.close()
            sb.toString()
        } catch (e: Exception) {
            e.printStackTrace()
            "console.error('HaramBlur: Failed to load injection script');"
        }
    }

    private fun injectScript(view: WebView?, script: String) {
        view?.evaluateJavascript(script, null)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

package com.haramblur.browser

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity
import java.io.BufferedReader
import java.io.InputStreamReader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var urlEditText: EditText
    private lateinit var goButton: Button

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize Views
        webView = findViewById(R.id.webView)
        urlEditText = findViewById(R.id.urlEditText)
        goButton = findViewById(R.id.goButton)

        // Enable Debugging
        WebView.setWebContentsDebuggingEnabled(true)

        // Configure WebView
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webChromeClient = WebChromeClient() // Required for some JS features

        // Load Scripts
        val humanScript = loadAsset("human.js")
        val haramBlurScript = loadAsset("haramblur.js")
        // Combine scripts: Human Lib first, then our logic
        val fullInjection = "$humanScript\n\n$haramBlurScript"

        // Set WebViewClient
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Update URL bar if needed
                if (url != null && !urlEditText.hasFocus()) {
                    urlEditText.setText(url)
                }
                // Inject Scripts
                injectScript(view, fullInjection)
            }
        }

        // Button Listener
        goButton.setOnClickListener {
            loadUrlFromInput()
        }

        // Load default URL
        webView.loadUrl("https://www.google.com")
    }

    private fun loadUrlFromInput() {
        var url = urlEditText.text.toString().trim()
        if (url.isEmpty()) return

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "https://$url"
        }
        webView.loadUrl(url)
        // Clear focus to hide keyboard
        urlEditText.clearFocus()
    }

    private fun loadAsset(fileName: String): String {
        return try {
            val inputStream = assets.open(fileName)
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
            "console.error('HaramBlur: Failed to load $fileName');"
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

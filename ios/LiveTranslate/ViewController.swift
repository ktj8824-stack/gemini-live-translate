import UIKit
import WebKit
import AVFoundation

class ViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10/255, green: 13/255, blue: 20/255, alpha: 1.0)

        setupAudioSession()
        setupWebView()
        loadLocalWebApp()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    private func setupAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // mode: .videoChat optimizes for loudspeaker output and prevents earpiece degradation
            try audioSession.setCategory(.playAndRecord, mode: .videoChat, options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP])
            try audioSession.overrideOutputAudioPort(.speaker)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            print("[AudioSession] Setup error: \(error)")
        }

        NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleAudioRouteChange), name: AVAudioSession.routeChangeNotification, object: nil)
    }

    @objc private func handleAudioRouteChange(notification: Notification) {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.overrideOutputAudioPort(.speaker)
        } catch {
            print("[AudioSession] Route change override error: \(error)")
        }
    }

    private func setupWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Allow WebRTC & local media streaming
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        config.defaultWebpagePreferences = preferences

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Enable Safari remote web inspector debugging on Mac
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }

    private func loadLocalWebApp() {
        // Clear WKWebsiteDataStore cache to ensure newest bundle assets are always loaded
        let websiteDataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        WKWebsiteDataStore.default().removeData(ofTypes: websiteDataTypes, modifiedSince: Date.distantPast) { [weak self] in
            guard let self = self else { return }
            guard let wwwPath = Bundle.main.path(forResource: "www", ofType: nil) else {
                print("[Error] 'www' folder not found in main bundle!")
                return
            }

            let wwwURL = URL(fileURLWithPath: wwwPath)
            let indexURL = wwwURL.appendingPathComponent("index.html")

            if FileManager.default.fileExists(atPath: indexURL.path) {
                self.webView.loadFileURL(indexURL, allowingReadAccessTo: wwwURL)
            } else {
                print("[Error] index.html not found at \(indexURL.path)")
            }
        }
    }

    // MARK: - WKUIDelegate: Grant getUserMedia Permission (iOS 15+)
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // Automatically grant microphone access to the embedded local app
        decisionHandler(.grant)
    }

    // Handle javascript alert in WKWebView
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "알림", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { _ in completionHandler() }))
        present(alert, animated: true)
    }

    // Handle javascript confirm
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "확인", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { _ in completionHandler(true) }))
        alert.addAction(UIAlertAction(title: "취소", style: .cancel, handler: { _ in completionHandler(false) }))
        present(alert, animated: true)
    }

    // Handle javascript prompt
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { _ in
            completionHandler(alert.textFields?.first?.text)
        }))
        alert.addAction(UIAlertAction(title: "취소", style: .cancel, handler: { _ in
            completionHandler(nil)
        }))
        present(alert, animated: true)
    }
}

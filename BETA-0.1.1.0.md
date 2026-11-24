# Mark & Listen 0.1.1.0 beta

- Install the Windows x64 setup file once to move from 0.1.0.0 to the signed update channel. Later betas can be checked from Settings → App update. After you confirm, the app verifies the release signature and installer hash, installs, and reopens.
- Part 1 can load six local JPEGs. The selected vision model receives the image data during question generation. Pilot photos and generated audio are stored locally.
- Live narration compares the complete script with the transcript before saving. The settings tests cover one sentence, several sentences, and A–D choices. Incomplete or changed narration is retried up to twice with the same selected model.
- The sidebar shows separate Codex, Gemini and GPT API connection states. Codex login starts the CLI browser flow and checks the result.

The Windows Actions release gate installs and launches this build in system WebView2, then verifies the exact installer and signs its update manifest. Automated tests use mock Live and vision responses, including the multi-sentence/A–D rejection cases. Real provider narration, completion of Codex sign-in in the Windows default browser, and an upgrade from this beta to a later signed beta have not been verified. The update signature is for the in-app channel, and the installer does not have a Windows Authenticode certificate.

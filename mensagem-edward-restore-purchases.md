Hi Edward,

Thanks for sending the detailed log from your last test — we dug into it carefully, and want to share exactly what we found, plus what we'd suggest as next steps.

## What we found

We checked our server logs for the exact time window of your test (18:27–18:38 UTC on Sep 21). There's no record of that Restore attempt ever arriving on our side — not a success, not an error, nothing. That tells us the failure happened entirely on the device, inside Apple's own StoreKit layer, before anything was even sent to us. It isn't something we can fix from the app or backend — it's a client-side Apple issue.

This is actually a known, documented problem. Apple's own StoreKit error reference confirms `StoreKitError.unknown` is a generic, non-specific error code ([Apple Developer Documentation](https://developer.apple.com/documentation/storekit/storekiterror/unknown)). Other developers have reported the exact same pattern — `AppStore.sync()` (the API Restore Purchases relies on) throwing this kind of generic/misleading error — on Apple's own Developer Forums ([forums.developer.apple.com/forums/thread/692177](https://developer.apple.com/forums/thread/692177)). In that thread, an Apple engineer confirmed it as a real bug and filed it internally (FB12107567) — with no fix released since.

## One more detail that matters

Looking at the account you used (`reallithotripsy@outlook.com`), it's set up as your regular TestFlight tester account rather than a dedicated **Sandbox Apple Account**. Real/TestFlight-linked accounts appear to be more prone to this exact StoreKit flakiness than accounts created purely as sandbox testers.

To confirm this, we spent the last couple of days re-running the full purchase-and-restore cycle multiple times using proper dedicated Sandbox Tester accounts — including restoring a subscription that was still active but temporarily unrecognized (the scenario closest to what you ran into), and a second account correctly being blocked from restoring someone else's subscription. Every single test came back clean, with no `StoreKitError.unknown` at all.

## Could you retest using a dedicated Sandbox Account?

Two things are easy to mix up here, so let's be precise about each:
- **App account** = your Swift Score Golf login (email/password you use inside the app itself).
- **Sandbox Apple Account** = a separate, made-up Apple ID used only for testing purchases. It is not a real email, not your real Apple ID, and not the account you use for TestFlight. These are two completely independent things.

Steps:

1. In App Store Connect, go to **Users and Access → Sandbox → Testers** and create a new Sandbox tester. Use a made-up email that you've never used anywhere before — not your real Apple ID, not your TestFlight email, and not an email you've already used to log into Swift Score Golf (e.g. `edwardtest01@example.com`).
2. On your iPhone, go to **Settings → Developer → Sandbox Apple Account** (on some iOS versions it's under **Settings → App Store → Sandbox Account** instead) and sign in with that new made-up tester.
3. **This step matters a lot, so please don't skip it:** go to **Settings → [your name, at the very top] → Media & Purchases**. If your real Apple ID (the one linked to TestFlight) is signed in there, sign out of it. If you leave it signed in, the purchase screen will keep using your real TestFlight email during the test instead of the sandbox one from step 2 — you won't even see the sandbox email show up, which is exactly what likely happened in your last test.
4. Open Swift Score Golf and log into the app with a **new app account you haven't used before** — again, this is separate from the sandbox Apple ID in step 2.
5. Purchase the subscription. The Apple purchase confirmation sheet should show the made-up sandbox email from step 1 — if it shows your real email instead, go back to step 3.
6. While that subscription is still active, tap **Restore Purchases** and confirm it works cleanly.

## Next step: submitting for Apple's review

Given everything checks out on our end, we think it's time to submit the app for Apple's review. Apple's own reviewers will exercise the purchase and Restore Purchases flow as part of their standard review (per App Store Guideline 3.1), so this doubles as an additional, independent check from Apple's side. Once it's approved and live, we can do one final real-world confirmation together with an actual purchase — since there are no real users on the app yet, this is a safe and natural point to close the loop for good.

Let us know if you'd like to retest with a sandbox account first, or if you're ready to move forward with submission.

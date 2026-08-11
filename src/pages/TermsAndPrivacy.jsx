import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TermsAndPrivacy() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">End User License Agreement (EULA)</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
          <p className="text-muted-foreground">This End User License Agreement ("Agreement") is a legal agreement between you ("User") and Swift Score Golf ("Company," "we," or "us") governing your use of the Swift Score Golf mobile application ("App"). By downloading or using the App, you agree to be bound by this Agreement.</p>
          <div>
            <h3 className="font-semibold mb-1">1. License Grant</h3>
            <p className="text-muted-foreground">We grant you a limited, non-exclusive, non-transferable, revocable license to use the App for personal, non-commercial purposes in accordance with this Agreement.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">2. App Purpose</h3>
            <p className="text-muted-foreground">Swift Score Golf is a golf scoring and payout calculation tool designed to assist users in organizing and calculating game results. The App is provided for informational and recreational purposes only.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">3. No Financial Liability</h3>
            <p className="text-muted-foreground">The App calculates scores and suggested payouts based on user input. We do not guarantee accuracy and are not responsible for any financial decisions, disputes, or losses resulting from the use of the App. All payouts, wagers, and financial agreements are solely the responsibility of the users.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">4. User Responsibility</h3>
            <p className="text-muted-foreground">You are responsible for entering accurate data, verifying results before acting on them, and ensuring compliance with local laws regarding games, wagering, or competitions.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">5. Disclaimer of Warranties</h3>
            <p className="text-muted-foreground">The App is provided "AS IS" and "AS AVAILABLE" without warranties of any kind. We do not guarantee that the App will be error-free, uninterrupted, or fully accurate.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">6. Limitation of Liability</h3>
            <p className="text-muted-foreground">To the maximum extent permitted by law, Swift Score Golf shall not be liable for any financial losses, disputes between players, data inaccuracies, or indirect or consequential damages.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">7. Modifications</h3>
            <p className="text-muted-foreground">We may update or modify the App at any time without notice. Continued use of the App constitutes acceptance of any changes.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">8. Termination</h3>
            <p className="text-muted-foreground">We reserve the right to suspend or terminate access to the App at any time for any reason.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">9. Governing Law</h3>
            <p className="text-muted-foreground">This Agreement shall be governed by the laws of the State of Washington, United States.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">10. Contact</h3>
            <p className="text-muted-foreground">If you have questions about this Agreement, contact: <a href="mailto:swiftscoregolf@gmail.com" className="text-primary underline">swiftscoregolf@gmail.com</a></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Terms of Use</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
          <div>
            <h3 className="font-semibold mb-1">1. Calculation Tool Only</h3>
            <p className="text-muted-foreground">Swift Score Golf is a golf score-tracking and payout calculation tool. The app does not process, hold, transfer, or facilitate any actual monetary transactions. All buy-in amounts and payout figures are for informational and organizational purposes only.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">2. User Responsibility</h3>
            <p className="text-muted-foreground">Users are solely responsible for any real-world financial arrangements made among participants. Swift Score Golf and its developers accept no liability for disputes, losses, or claims arising from the use of calculated figures.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">3. Social and Recreational Use</h3>
            <p className="text-muted-foreground">This app is intended for use in friendly, social golf games among consenting participants. Users are responsible for ensuring their use of the app complies with all applicable local laws and regulations.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">4. No Warranties</h3>
            <p className="text-muted-foreground">The app is provided "as is" without warranties of any kind. We make no guarantees regarding the accuracy of calculated results. Always verify payouts independently before settling.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">5. Changes to Terms</h3>
            <p className="text-muted-foreground">We reserve the right to update these terms at any time. Continued use of the app constitutes acceptance of any revised terms.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Subscription Terms</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: July 2026</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
          <div>
            <h3 className="font-semibold mb-1">1. Subscription Plans</h3>
            <p className="text-muted-foreground">Swift Score Golf Premium is available as an auto-renewing subscription with the following plans:</p>
            <ul className="text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li><strong>Monthly Plan:</strong> $2.99 USD per month</li>
              <li><strong>Yearly Plan:</strong> $29.99 USD per year (save 17%)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-1">2. Free Trial</h3>
            <p className="text-muted-foreground">New subscribers are eligible for a 30-day free trial. The trial begins upon subscription confirmation and provides full access to all Premium features. If you do not cancel at least 24 hours before the trial ends, your subscription automatically converts to a paid plan and your Apple ID is charged the applicable subscription price.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">3. Auto-Renewal</h3>
            <p className="text-muted-foreground">Your subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current subscription period. Your Apple ID account will be charged for renewal within 24 hours prior to the end of the current period, and the renewal cost is identified at the time of purchase.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">4. Payment</h3>
            <p className="text-muted-foreground">Payment is charged to your Apple ID account upon confirmation of purchase. Subscriptions are managed and billed by Apple through the App Store. Swift Score Golf does not directly process or store your payment information.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">5. Cancellation & Management</h3>
            <p className="text-muted-foreground">You can cancel or manage your subscription at any time through your Apple ID settings:</p>
            <ul className="text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Open the <strong>Settings</strong> app on your iPhone</li>
              <li>Tap your name at the top, then tap <strong>Subscriptions</strong></li>
              <li>Select <strong>Swift Score Golf Premium</strong></li>
              <li>Tap <strong>Cancel Subscription</strong> (or choose a different plan)</li>
            </ul>
            <p className="text-muted-foreground mt-2">You may also manage your subscription online at <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" className="text-primary underline">apps.apple.com/account/subscriptions</a>.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">6. Restore Purchases</h3>
            <p className="text-muted-foreground">If you reinstall the app or switch devices, tap "Restore Purchases" on the subscription page to restore your active subscription at no additional charge.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">7. Refunds</h3>
            <p className="text-muted-foreground">Refunds for subscriptions are handled by Apple. To request a refund, visit <a href="https://reportaproblem.apple.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">reportaproblem.apple.com</a> within 14 days of purchase. Apple's refund policy applies.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">8. What You Get</h3>
            <p className="text-muted-foreground">Swift Score Golf Premium includes: unlimited tournaments, automatic gross & net scoring, automatic payouts, gross & net skins, KP and deuce pot tracking, handicap management, email & text result sharing, and all future premium feature updates for the duration of your subscription.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Privacy Policy</CardTitle>
          <p className="text-sm text-muted-foreground">Last updated: April 2026</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground leading-relaxed">
          <div>
            <h3 className="font-semibold mb-1">1. Information We Collect</h3>
            <p className="text-muted-foreground">We collect the information you provide when using the app, including your name, email address (used for login), player names, handicaps, mobile phone numbers (optional, used only for sending round results), and round data you enter.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">2. How We Use Your Information</h3>
            <p className="text-muted-foreground">Your data is used solely to provide the app's functionality — storing rounds, rosters, scores, and results. We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">3. Result Sharing</h3>
            <p className="text-muted-foreground">The app includes an optional feature that allows you to share round results with other participants via SMS or email. This feature is entirely user-initiated. Phone numbers and email addresses entered for players are used only for this purpose and are never shared with third parties.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">4. Data Storage</h3>
            <p className="text-muted-foreground">Round and player data is stored securely in the cloud. You can delete your rounds at any time from the History page.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">5. Data Deletion</h3>
            <p className="text-muted-foreground">You have the right to delete your account and all associated data at any time. To permanently delete your account and all stored data, go to Settings and tap "Delete Account." This action is irreversible. You may also contact us directly at swiftscoregolf@gmail.com to request data removal.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">6. Third-Party Services</h3>
            <p className="text-muted-foreground">The app is built on the Base44 platform. Your data is subject to their infrastructure security standards. We do not integrate with advertising networks or analytics services that track personal behavior.</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">7. Contact</h3>
            <p className="text-muted-foreground">For any privacy-related questions or data removal requests, please contact us at: <a href="mailto:swiftscoregolf@gmail.com" className="text-primary underline">swiftscoregolf@gmail.com</a></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
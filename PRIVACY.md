# ReadFold Privacy Policy

**Last updated: November 12, 2026**

ReadFold is a reading-based language-learning application. Guest reading and learning data remain in the browser.
Optional Google/GitHub authentication and account synchronization use Supabase when configured.
The complete policy shipped with the application is [public/privacy.html](public/privacy.html).

## Information we process

When you sign in using Google or GitHub, the authentication provider may share an account identifier, email address, display name, and profile image with our authentication provider, Supabase. ReadFold uses this information to authenticate you and associate your learning progress with your account.

When you use the application, ReadFold may store reading progress, learning preferences, vocabulary and grammar learning status, quiz results, and synchronization metadata. Some data is stored locally in your browser using IndexedDB; signed-in users' learning data may also be synchronized with Supabase.

Diagnostic aggregates are local, limited to 100 groups and expire after seven days when accessed or written.
ReadFold never automatically sends diagnostic logs to Supabase. Reports whitelist codes, categories,
severity, counts and timestamps. Users may deliberately export and share them.

## How information is used

We use this information to provide authentication, save and synchronize learning progress, restore user settings, and maintain the application's reliability. We do not sell personal information or use Google account information for advertising.

## Service providers

ReadFold uses Supabase for authentication and hosted database services, and GitHub Pages/GitHub for application hosting and publicly available reading content. Google and GitHub process authentication information under their own privacy policies.

## Storage and security

Local data is stored in your browser. Cloud account and learning data is stored using Supabase. We aim to restrict access to each user's information using authentication and database access policies. No online system can guarantee absolute security.

## Retention and deletion

Settings supports selected-owner JSON export/import and a separate diagnostic export. Signing out preserves
local operations, including unsynchronized changes. Locally stored data can be removed using browser site-data
controls. Cloud event history persists until a verified deletion request is completed; there is no automatic
inactivity deletion. Request deletion through [GitHub Issues](https://github.com/StriderAJR/ReadFold/issues)
without publishing private information. Deleting browser data does not delete cloud data or provider backups.

## Your choices

You may choose not to sign in if guest mode is available. You can revoke ReadFold's access through your Google or GitHub account settings. Revoking provider access does not automatically delete information already stored by ReadFold.

## Children's privacy

ReadFold is not specifically directed to children under 13. We do not knowingly solicit personal information from children under 13.

## Changes to this policy

We may update this policy as the application develops. The updated version and its revision date will be published in this repository.

## Contact

For privacy inquiries or data-deletion requests, open an issue at:

https://github.com/StriderAJR/readfold/issues

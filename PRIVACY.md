# Privacy Policy

Last updated: September 10, 2026

This policy describes how SOTN Preset Generator, maintained by [ndsmith201](https://github.com/ndsmith201), handles information in the desktop application and its connections to the default community service. Modified builds and separately configured services may behave differently.

## Information stored on your device

The app saves your preset drafts, names, creation and modification times, selected options, custom options, author setting, display preferences, and export directory locally. It also keeps records of successful exports, including file paths, preset snapshots, and file hashes, and records which community options you have imported.

On Windows, the app's profile is stored in `%APPDATA%\sotn-preset-generator`, using local storage and an SQLite database. Exported presets, built presets, and generated patches are stored separately in the directories you choose or in the writable bundled `sotnrando` directory. Local editing, exporting, and patch generation do not require a community account. These operations do not upload your drafts or generated files through the app's community or update connections.

Preset JSON can contain author names and other information you enter or inherit from a template. When signed in, your community username is added to generated preset authors; when signed out, the app uses your saved author setting. Review the JSON before distributing it.

## Network connections and their purposes

The app makes the following connections, including some before you sign in:

- **Community browsing:** Opening the preset library automatically requests public presets and options from the community service. Refreshing, loading more, or viewing an item makes additional requests. These read requests do not include your account access token. Searching already loaded community items happens locally.
- **Accounts:** Signing up or signing in sends your username and password over HTTPS to Amazon Cognito to create or authenticate your account. The current sign-up screen does not request an email address. Older accounts or other supported service configurations may use an email address. Refreshing a session sends a refresh token to Cognito.
- **Sharing and voting:** After you confirm sharing, the app sends the selected preset JSON or option fields to the community service. Sharing and voting include an account access token so the service can associate the action with your account. Votes also send the item identifier and your vote choice.
- **Updates:** Packaged Windows builds automatically contact GitHub at startup to check the latest release. The check identifies the app as `SOTNPresetGenerator`; version comparison happens locally. Update files are downloaded after you approve the update. Portable builds can open the release page in your browser.

Servers receiving these requests necessarily receive your IP address and request metadata, such as the requested resource and HTTP headers. Hosting providers may record connection times, errors, and security or operational logs. The desktop app does not include advertising, usage analytics, or automatic crash-report uploads.

## Public community content

Shared presets and options are public: other people can view, copy, and use them. Public catalog records include the submitted content, a creator identifier, creation time, and vote totals. Presets may include author names, descriptions, comments, and any other fields present in the submitted JSON. Avoid including private information in public submissions.

Deleting a local draft or option does not remove a community submission. Copies already obtained by other people may remain available even if the original submission is removed.

## Account storage and security

The app does not save your password to its local profile. Access tokens are held in the app's main-process memory. To remember your session, the app stores your account identifier and refresh token encrypted with operating-system secure storage. If secure storage is unavailable, the session remains in memory only.

Other local app data, including presets and settings, is not encrypted by the app. Its protection depends on your device and account security. Default community and account connections use HTTPS.

## Service providers

The default community API is hosted on Amazon Web Services, and authentication uses Amazon Cognito. The configured AWS region is `us-east-1` in the United States. GitHub hosts the source repository, release checks, and release downloads. Information sent to these services may be processed outside your country.

For those providers' own privacy practices, see the [AWS Privacy Notice](https://aws.amazon.com/privacy/) and [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Opening external links also subjects your browser activity to the destination site's practices.

## Retention and your choices

Local data remains until you remove it. You can delete drafts and custom options in the app and copy or export preset JSON. Export records can retain a preset snapshot after a draft is deleted. To remove the entire local profile, close the app and remove `%APPDATA%\sotn-preset-generator`; back up anything you want to keep first. Remove exported files and the writable randomizer directory separately if desired. Uninstalling the app should not be relied on to remove all of these locations or your own backups.

Signing out clears the app's current session and saved session record on that device. It does not delete your server account, public submissions, or votes, or sign out other devices. You can use **Remove my vote** on a community item. The app does not provide account deletion or deletion of public submissions; contact the maintainer to request access, correction, or removal of server-held information.

The desktop app does not set or enforce retention periods for server accounts, submissions, service logs, or backups. Contact the maintainer for service-side retention details and requests; no automatic server-deletion deadline is specified here.

You can use local editing without signing in. Signing out does not stop public catalog requests or update checks. The app has no setting to disable those automatic connections; local features remain usable while offline.

## Contact and policy changes

For privacy questions or requests, open an issue in the [project issue tracker](https://github.com/ndsmith201/SOTNPresetGenerator/issues) asking the maintainer for a private contact method. GitHub issues are public: do not post passwords, tokens, or other sensitive information there.

Revisions to this policy will be published in this file with an updated date. Consult the policy included with the source for the version you use when comparing changes in app behavior.

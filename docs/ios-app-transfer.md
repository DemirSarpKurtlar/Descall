# iOS app transfer plan (Emre Kurtlar individual team → Demir / company team)

Today `com.descall.app` belongs to Emre KURTLAR's individual Apple Developer
team `Q9R78TPNXS`. This is what has to happen if the app moves to Demir's own
team or a company team. Apple's references:
"Transferring your apps and users to another team" (Sign in with Apple docs),
TN3159 "Migrating Sign in with Apple users for an app transfer", and
App Store Connect Help → "Transfer an app".

## Before starting the transfer

- Check App Store Connect Help → "App transfer criteria". It requires, among
  other things, at least one released App Store version, no version in review,
  and both accounts with accepted agreements and in good standing.
- Sign in with Apple: if apps are grouped for SIWA, ungroup them. Any Services ID
  tied to the primary App ID moves with the app; detach it first if it should stay.
- Plan the 60-day migration window below before pressing Transfer.

## Sign in with Apple user migration (must finish within 60 days)

Apple user identifiers (`sub`, stored in `public.users.apple_sub`) are scoped to
the team. After the transfer, the same Apple ID signs in with a **different `sub`**.
Users who chose "Hide My Email" also get a **new private-relay address**. If they
aren't migrated, SIWA users can't reach their old accounts.

1. **Old team (Q9R78TPNXS), for every user with `apple_sub`:**
   - Get a client-credentials access token: `POST https://appleid.apple.com/auth/token`
     with `grant_type=client_credentials`, `scope=user.migration`, `client_id`
     (`com.descall.app`) and a `client_secret` JWT signed with the old team's SIWA key.
   - Call `POST https://appleid.apple.com/auth/usermigrationinfo` with `sub`,
     `target=<recipient team ID>`, `client_id` and `client_secret`, using that
     access token as the Bearer token. Store the returned `transfer_sub` next to
     the user (new nullable column, additive migration).
   - This step can run before the recipient accepts the transfer, or up to
     60 days after.
2. **Transfer the app** in App Store Connect and have the recipient accept it.
3. **New team, within 60 days of accepting:**
   - Get a `user.migration` access token with the new team's credentials.
   - Call `usermigrationinfo` with `transfer_sub`, `client_id` and the new team's
     `client_secret`.
   - Update `apple_sub` to the returned new `sub`. If the response includes a
     private-relay `email`, update the stored email too.
4. Both teams can use the migration endpoints during the 60-day window. If the
   window is missed, the app must be transferred back to the old team and the
   process repeated (TN3159).
5. Until step 3 is done for a user, a sign-in with an unknown `sub` must not
   create a duplicate account or link by email to an unverified account (same
   rule as the c45e1d4 / 2.9.127 linking fix).

## Keys and secrets to recreate on the new team

Keys belong to a team and can't be moved. Create new ones on the recipient team,
update the deployment, then revoke the old ones once the migration is done.

| What | Used by | Where to update |
| --- | --- | --- |
| APNs auth key (alert + **VoIP** pushes; team-scoped, Sandbox & Production) | backend `lib/fcm.js`, `lib/voipPush.js` | Render env `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (`APNS_BUNDLE_ID` stays `com.descall.app`) |
| Sign in with Apple key (client secret, token revoke) | backend `lib/appleAuth.js` | Render env `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY`, `APPLE_TEAM_ID` (+ `APPLE_CLIENT_ID` / Services IDs if they change) |
| App Store Connect API key ("Descall CI") | `.github/workflows/ios-testflight.yml` | GitHub secrets `ASC_KEY_P8`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID` |

Also on the new team:
- Confirm the App ID still has Push Notifications and Sign in with Apple enabled.
- Cloud-managed distribution signing creates a new certificate and profile on
  the first CI run.
- The App Store Connect Apple ID of the app (`ASC_APP_ID` in the workflow,
  6820558264) should stay the same. Verify it after the move.
- Existing APNs and VoIP device tokens should keep working with the new team's
  key, because the bundle ID moves with the app. Send one test alert push and
  one test VoIP call before revoking the old key.

# REDLINE — Mafia Party Game

A dark, responsive real-time Mafia party game for friends. This is a static website backed by Firebase Realtime Database and Firebase Anonymous Authentication. **It is not online until you add your Firebase config, publish the database rules, and deploy the site.**

## Included

- Create a room and share a six-character code
- Join a room with a nickname
- Live lobby/player list
- One randomly selected Mafia and all other players as Villagers
- Private role reads stored separately per authenticated player; Mafia identity is kept in a host-controlled secret until results
- Voting, automatic counting, tie handling, results and new rounds
- Responsive desktop/mobile design

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. In **Build → Realtime Database**, create a database. Choose a region and start in locked mode.
3. In **Build → Authentication → Sign-in method**, enable **Anonymous**.
4. In **Project settings → General → Your apps**, add a Web app and copy its Firebase config.
5. Open `app.js` and replace the placeholder values in `firebaseConfig`:
   - `apiKey`
   - `authDomain`
   - `databaseURL` (copy the exact URL shown in Realtime Database)
   - `projectId`
   - `appId`

Do not paste a service-account key into browser code. The normal Firebase web config is designed to be included in a client app; access is controlled by database rules.

## 2. Publish database rules

In **Realtime Database → Rules**, paste the contents of `database.rules.json` and click **Publish**.

These rules are a starter implementation for a small friends-only game. Review and test them in the Firebase Rules Playground before sharing publicly. Firebase rules are security-critical; a client-side game cannot be treated as cheat-proof, and the host browser currently controls role assignment/results. For a public competitive game, move privileged game transitions to trusted server code (for example, Cloud Functions) and add rate limiting/room expiry.

## 3. Test locally

ES modules generally need a local web server; don't open `index.html` directly from a `file://` URL.

With Python installed, open a terminal in this folder and run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`. Open another browser/incognito window to test a second player. Anonymous Authentication must be enabled and the config/rules must be correct.

## 4. Deploy free with GitHub Pages

1. Create a new GitHub repository, for example `redline-mafia`.
2. Upload `index.html`, `style.css`, `app.js`, and `database.rules.json` (and optionally this README).
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**, choose `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish. Open the URL shown in Pages settings.

Firebase Realtime Database's free tier is suitable for small friend groups within its current quotas. Check Firebase's current Spark-plan limits for your region and usage. GitHub Pages hosts the static files; Firebase handles realtime data.

## Gameplay notes

- The game requires at least **3 players** to start.
- The host starts the round; every player privately loads their role.
- The host advances the game to voting after role reveals. Ask everyone to click **Continue to voting** after checking their role; the host should do this last.
- Votes are final. When everyone has voted, the host browser writes the results.
- A shared highest vote count is announced as a tie.
- This version is a simple first release, not a hardened competitive game. Test room creation, joining, role visibility, voting and a new round before inviting friends.

## Troubleshooting

- **Firebase not configured:** check the values in `app.js`, especially the exact `databaseURL`.
- **Anonymous sign-in fails:** enable Authentication → Sign-in method → Anonymous.
- **Permission denied:** publish the provided rules and check that you are testing with the correct Firebase project.
- **Room code not found:** the room host may have left or deleted it. Create a new room.
- **Not syncing:** check the browser console and Firebase Realtime Database usage/connection status.

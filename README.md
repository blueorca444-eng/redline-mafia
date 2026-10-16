# SussyRivals

A bright, live party game for 1–6 players. One random player is the impostor, everyone else is a crewmate. Talk it out, then vote. Static site backed by Firebase Realtime Database and Anonymous Authentication.

## Setup

1. Create a Firebase project, a Realtime Database, and enable **Authentication → Anonymous**.
2. Put your web app config in `firebaseConfig` at the top of `app.js`.
3. In **Realtime Database → Rules**, publish the contents of `database_rules.json` (the version from the first fix: the `.write` rules for `privateRoles` and `gameSecrets` sit at the `$room` level).
4. Test locally with `python -m http.server 8000`, then open `http://localhost:8000`.
5. Deploy by uploading `index.html`, `style.css` and `app.js` to GitHub Pages.

## Testing alone

Create a room, then use **Add test player** in the lobby (host only, up to 6 players total). Test players vote randomly a moment after the host starts voting. Use the ✕ next to a player to remove them, or **End round now** during voting to finish with whatever votes are in.

## Notes

- Players: 1–6. There is no minimum. With only one player nobody can be voted for, so the host ends the round.
- The host's browser picks the impostor and counts votes. It is not cheat-proof, so keep it to friends.
- Refreshing the page puts you back in your room.
- A non-host who leaves during a game may stay listed until the host removes them or ends the round (rules only allow leaving in the lobby).
- Restrict your API key to your site's domain in Google Cloud Console.

## Troubleshooting

- **Permission denied:** republish `database_rules.json` and check you're in the right Firebase project.
- **Sign-in fails:** enable Anonymous sign-in.
- **Room not found:** the host may have left, which closes the room.

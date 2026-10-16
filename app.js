import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDghAyh8h-bacUaffE4gAq4pMYkwXewz9I",
  authDomain: "mafia-34c10.firebaseapp.com",
  databaseURL: "https://mafia-34c10-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mafia-34c10",
  storageBucket: "mafia-34c10.firebasestorage.app",
  messagingSenderId: "461103064592",
  appId: "1:461103064592:web:39ce01a6e508ad5c588c95",
  measurementId: "G-8WVC7M72Y8"
};

const MAX = 6;
const COLORS = ["#ff4d5e","#4d7cff","#3fd17f","#ffd23f","#ff8fd0","#ff9a3d","#b16bff","#6fe3ff"];
const BOT_NAMES = ["Bleep","Bloop","Zorp","Pip","Mox","Juno"];
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const $ = id => document.getElementById(id) || (console.warn("Missing element #" + id), document.createElement("div"));
const screens = ["home-screen","entry-screen","lobby-screen","role-screen","vote-screen","results-screen"];
const state = { user:null, roomCode:null, room:null, mode:"create", selectedVote:null, roleVisible:true, unsub:[], busy:false, shown:null, phaseKey:null, myRole:null, lastMafiaUid:null };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const crew = c => `<svg class="crew" viewBox="0 0 40 44" aria-hidden="true"><rect class="pack" x="2" y="14" width="9" height="17" rx="4" fill="${c}"/><rect x="7" y="31" width="11" height="11" rx="4" fill="${c}"/><rect x="22" y="31" width="11" height="11" rx="4" fill="${c}"/><rect x="7" y="2" width="26" height="34" rx="13" fill="${c}"/><rect x="17" y="9" width="19" height="12" rx="6" fill="#d8f6ff" stroke="#10102a" stroke-width="2"/></svg>`;
const colorOf = p => COLORS[(Number.isInteger(p.c) ? p.c : 0) % COLORS.length];
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeName = s => String(s || "").trim().replace(/[<>]/g, "").slice(0, 18);
const err = (id, m) => { $(id).textContent = m || ""; };
const code = () => Array.from({length:6}, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");
const players = () => Object.entries(state.room?.players || {}).map(([uid, p]) => ({ ...p, uid })).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
const isHost = () => !!state.user && state.room?.hostUid === state.user.uid;
const roomRef = (path = "") => ref(db, `rooms/${state.roomCode}${path ? "/" + path : ""}`);
const save = v => { try { v ? localStorage.setItem("sr_room", v) : localStorage.removeItem("sr_room"); } catch {} };
const saved = () => { try { return localStorage.getItem("sr_room"); } catch { return null; } };

signInAnonymously(auth).catch(e => { console.error(e); state.authError = e.code || e.message; toast("Firebase sign-in failed: " + state.authError); });
onAuthStateChanged(auth, async user => {
  state.user = user;
  const c = saved();
  if (!user || !c || state.roomCode) return;
  try {
    const snap = await get(ref(db, `rooms/${c}`));
    if (snap.exists() && snap.val().players?.[user.uid]) { state.roomCode = c; listenRoom(); } else save(null);
  } catch {}
});

let toastTimer;
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2400); }
function showScreen(id) {
  if (state.shown === id) return;
  state.shown = id;
  screens.forEach(s => $(s).classList.toggle("hidden", s !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function stopListeners() { state.unsub.forEach(fn => fn()); state.unsub = []; }
function resetLocal() {
  stopListeners(); save(null);
  Object.assign(state, { roomCode:null, room:null, selectedVote:null, phaseKey:null, myRole:null, roleVisible:true });
  $("leave-top").classList.add("hidden");
  showScreen("home-screen");
}

function listenRoom() {
  stopListeners();
  state.unsub.push(onValue(roomRef(), snap => {
    if (!snap.exists()) { toast("This room was closed."); resetLocal(); return; }
    state.room = snap.val();
    if (!state.room.players?.[state.user.uid]) { toast("You were removed from the room."); resetLocal(); return; }
    route();
  }, e => toast("Connection error: " + e.message)));
}
function route() {
  const r = state.room, ph = r.phase, key = ph + ":" + (r.round || 0);
  if (key !== state.phaseKey) { state.phaseKey = key; state.selectedVote = null; state.myRole = null; state.roleVisible = true; }
  $("leave-top").classList.remove("hidden");
  renderLobby();
  if (ph === "lobby") showScreen("lobby-screen");
  else if (ph === "role") loadRole();
  else if (ph === "voting") renderVote();
  else if (ph === "results") renderResults();
}

function renderLobby() {
  const r = state.room, ps = players(), host = isHost(), inLobby = r.phase === "lobby";
  $("room-code-display").textContent = state.roomCode;
  $("player-count").textContent = `${ps.length} / ${MAX}`;
  $("player-list").innerHTML = ps.map(p => `<div class="player-row">${crew(colorOf(p))}<span class="player-name">${escapeHtml(p.name || "?")}</span>${p.uid === r.hostUid ? '<span class="tag">Host</span>' : ""}${p.bot ? '<span class="tag">Test</span>' : ""}${p.uid === state.user.uid ? '<span class="tag you">You</span>' : ""}${host && inLobby && p.uid !== state.user.uid ? `<button class="kick" data-uid="${escapeHtml(p.uid)}" aria-label="Remove ${escapeHtml(p.name || "player")}">✕</button>` : ""}</div>`).join("");
  $("lobby-status").textContent = ps.length === 1 ? (host ? "Solo mode. Add a test player to try voting." : "Waiting for more players…") : (host ? "Ready when you are." : "Waiting for the host to start…");
  $("start-game").classList.toggle("hidden", !host);
  $("start-game").disabled = !inLobby;
  $("add-bot").classList.toggle("hidden", !host || !inLobby || ps.length >= MAX);
}

function openEntry(mode) {
  state.mode = mode;
  $("entry-title").textContent = mode === "create" ? "Create your room" : "Join a room";
  $("entry-subtitle").textContent = mode === "create" ? "Pick a nickname and open your lobby." : "Enter the room code your friend shared.";
  $("entry-submit").textContent = mode === "create" ? "Create room" : "Join room";
  $("room-code-wrap").classList.toggle("hidden", mode === "create");
  err("entry-error", ""); showScreen("entry-screen");
}
async function enterRoom(e) {
  e.preventDefault(); if (state.busy) return;
  const name = safeName($("nickname").value);
  if (!name) return err("entry-error", "Enter a nickname to continue.");
  if (!state.user) return err("entry-error", state.authError ? "Firebase sign-in failed (" + state.authError + "). Check that Anonymous sign-in is enabled and this site is an authorized domain." : "Still connecting to Firebase. Wait a moment and try again.");
  state.busy = true; err("entry-error", "");
  try {
    const uid = state.user.uid; let c;
    if (state.mode === "create") {
      do { c = code(); } while ((await get(ref(db, `rooms/${c}`))).exists());
      state.roomCode = c;
      await set(roomRef(), { hostUid: uid, phase: "lobby", round: 0, createdAt: Date.now(), players: { [uid]: { name, joinedAt: Date.now(), c: 0 } } });
    } else {
      c = $("room-code").value.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(c)) throw new Error("Enter the 6-character room code.");
      state.roomCode = c;
      const snap = await get(roomRef());
      if (!snap.exists()) throw new Error("Room not found. Check the code and try again.");
      const room = snap.val(), ps = room.players || {};
      if (!ps[uid]) {
        if (room.phase !== "lobby") throw new Error("This game has already started.");
        if (Object.keys(ps).length >= MAX) throw new Error(`This room is full (max ${MAX} players).`);
        const used = new Set(Object.values(ps).map(p => p.c)); let k = 0; while (used.has(k)) k++;
        await set(roomRef(`players/${uid}`), { name, joinedAt: Date.now(), c: k });
      }
    }
    save(c); listenRoom();
  } catch (ex) { err("entry-error", ex.message || "Could not enter the room."); state.roomCode = null; }
  finally { state.busy = false; }
}

async function addBot() {
  const ps = players(); if (!isHost() || ps.length >= MAX) return;
  const used = new Set(ps.map(p => p.c)); let c = 0; while (used.has(c)) c++;
  const names = new Set(ps.map(p => p.name)); const name = BOT_NAMES.find(n => !names.has(n)) || "Bot";
  try { await set(roomRef(`players/bot_${Math.random().toString(36).slice(2, 8)}`), { name, joinedAt: Date.now(), c, bot: true }); }
  catch (e) { err("lobby-error", "Could not add a test player: " + e.message); }
}

async function startGame() {
  if (!isHost()) return;
  err("lobby-error", "");
  try {
    const ps = players(), round = (state.room.round || 0) + 1;
    const pool = ps.length > 1 ? ps.filter(p => p.uid !== state.lastMafiaUid) : ps;
    const mafia = pool[Math.floor(Math.random() * pool.length)].uid;
    const writes = {};
    ps.forEach(p => writes[`privateRoles/${state.roomCode}/${p.uid}`] = { role: p.uid === mafia ? "mafia" : "villager", round });
    await update(ref(db), writes);
    await set(ref(db, `gameSecrets/${state.roomCode}`), { mafiaUid: mafia });
    await update(roomRef(), { phase: "role", round, startedAt: Date.now(), votes: null, results: null });
  } catch (e) { err("lobby-error", "Could not start game: " + e.message); }
}

async function loadRole() {
  const key = state.phaseKey;
  if (state.myRole?.key !== key) {
    try {
      const snap = await get(ref(db, `privateRoles/${state.roomCode}/${state.user.uid}`));
      if (!snap.exists()) return;
      state.myRole = { key, role: snap.val().role };
    } catch { toast("Could not load your private role."); return; }
  }
  if (state.phaseKey === key) renderRole();
}
function renderRole() {
  const role = state.myRole.role, imp = role === "mafia", host = isHost();
  $("role-card").classList.toggle("mafia", imp);
  $("role-symbol").textContent = imp ? "🔪" : "🧑‍🚀";
  $("role-name").textContent = imp ? "Impostor" : "Crewmate";
  $("role-description").textContent = imp ? "Blend in and steer the votes toward someone else." : "Find the one person lying to everyone.";
  $("role-card").classList.toggle("hidden", !state.roleVisible);
  $("hide-role").textContent = state.roleVisible ? "Hide my role" : "Reveal my role";
  $("go-vote").classList.toggle("hidden", !host || !state.roleVisible);
  $("role-wait").classList.toggle("hidden", host);
  showScreen("role-screen");
}

async function goVoting() {
  if (!isHost()) return;
  try {
    await update(roomRef(), { phase: "voting", votes: null, votingStartedAt: Date.now() });
    const ps = players();
    ps.filter(p => p.bot).forEach((b, i) => setTimeout(() => {
      const opts = ps.filter(p => p.uid !== b.uid); if (!opts.length) return;
      set(roomRef(`votes/${b.uid}`), { voterUid: b.uid, targetUid: opts[Math.floor(Math.random() * opts.length)].uid, at: Date.now() }).catch(() => {});
    }, 1200 + i * 900));
  } catch (e) { toast("Could not start voting."); }
}

function renderVote() {
  showScreen("vote-screen");
  const ps = players(), uid = state.user.uid, votes = state.room.votes || {}, mine = votes[uid];
  const others = ps.filter(p => p.uid !== uid);
  if (mine) state.selectedVote = mine.targetUid;
  if (!others.some(p => p.uid === state.selectedVote)) state.selectedVote = null;
  $("vote-round").textContent = `Round ${state.room.round || 1}`;
  $("vote-list").innerHTML = others.length ? others.map(p => `<button class="vote-person ${state.selectedVote === p.uid ? "selected" : ""}" data-uid="${escapeHtml(p.uid)}" ${mine ? "disabled" : ""}><span class="vote-check">${state.selectedVote === p.uid ? "✓" : ""}</span>${crew(colorOf(p))}<b>${escapeHtml(p.name || "?")}</b><small>${p.bot ? "Test player" : p.uid === state.room.hostUid ? "Host" : "Player"}</small></button>`).join("") : '<p class="empty">Nobody else is aboard, so there’s no one to vote for. The host can end the round.</p>';
  $("submit-vote").disabled = !state.selectedVote || !!mine;
  $("submit-vote").textContent = mine ? "Vote locked" : "Lock in vote";
  $("end-round").classList.toggle("hidden", !isHost());
  const count = ps.filter(p => votes[p.uid]).length, left = ps.length - count;
  $("votes-cast").textContent = count; $("votes-total").textContent = ps.length;
  $("vote-status").textContent = left === 0 ? "All votes are in. Counting…" : `${left} player${left === 1 ? "" : "s"} still to vote`;
  if (isHost() && ps.length > 1 && left === 0) calculateResults();
}
async function castVote() {
  const target = state.selectedVote;
  if (!target || !state.room || state.room.votes?.[state.user.uid]) return;
  try { await set(roomRef(`votes/${state.user.uid}`), { voterUid: state.user.uid, targetUid: target, at: Date.now() }); toast("Vote locked in."); }
  catch (e) { err("vote-error", e.message); }
}

let calculating = false;
async function calculateResults() {
  if (calculating || !isHost() || state.room?.phase !== "voting") return;
  calculating = true;
  try {
    const ids = new Set(players().map(p => p.uid));
    const snap = await get(roomRef("votes")), votes = snap.val() || {}, counts = {};
    Object.entries(votes).forEach(([voter, v]) => { if (ids.has(voter) && ids.has(v.targetUid)) counts[v.targetUid] = (counts[v.targetUid] || 0) + 1; });
    const max = Math.max(0, ...Object.values(counts)), winners = Object.keys(counts).filter(u => counts[u] === max);
    const mafiaUid = (await get(ref(db, `gameSecrets/${state.roomCode}/mafiaUid`))).val();
    const outcome = max === 0 || winners.length !== 1 ? "tie" : winners[0] === mafiaUid ? "caught" : "missed";
    await update(roomRef(), { phase: "results", results: { counts, max, winners, outcome, mafiaUid, finishedAt: Date.now() } });
  } catch (e) { toast("Could not count votes."); } finally { calculating = false; }
}

function renderResults() {
  showScreen("results-screen");
  const r = state.room.results || {}, ps = players(), host = isHost();
  const name = uid => (ps.find(p => p.uid === uid) || {}).name || "Unknown";
  state.lastMafiaUid = r.mafiaUid;
  $("results-title").textContent = r.outcome === "tie" ? "A tie. No verdict." : r.outcome === "caught" ? "Impostor caught!" : "Wrong accusation.";
  $("results-outcome").textContent = r.outcome === "tie" ? "Vote tied" : r.outcome === "caught" ? "Crew wins" : "Impostor wins";
  $("results-subtitle").textContent = r.outcome === "tie" ? "The top vote count was shared. Nobody wins this round." : "Here’s how everyone voted.";
  const sorted = Object.entries(r.counts || {}).sort((a, b) => b[1] - a[1]);
  $("results-detail").innerHTML = sorted.length ? sorted.map(([u, n]) => `${escapeHtml(name(u))}: ${n} vote${n === 1 ? "" : "s"}`).join("<br>") : "No votes were recorded.";
  $("mafia-name").textContent = name(r.mafiaUid);
  $("new-round").classList.toggle("hidden", !host);
  $("results-wait").classList.toggle("hidden", host);
}
async function newRound() {
  if (!isHost()) return;
  try {
    await remove(ref(db, `privateRoles/${state.roomCode}`));
    await remove(ref(db, `gameSecrets/${state.roomCode}`));
    await update(roomRef(), { phase: "lobby", votes: null, results: null });
  } catch (e) { toast("Could not start a new round."); }
}
async function leaveRoom() {
  const c = state.roomCode;
  try {
    if (c && state.user) {
      if (isHost()) { await remove(ref(db, `privateRoles/${c}`)); await remove(ref(db, `gameSecrets/${c}`)); await remove(roomRef()); }
      else await remove(roomRef(`players/${state.user.uid}`));
    }
  } catch {}
  resetLocal();
}

$("show-create").onclick = () => openEntry("create");
$("show-join").onclick = () => openEntry("join");
$("back-home").onclick = () => showScreen("home-screen");
$("entry-form").addEventListener("submit", enterRoom);
$("start-game").onclick = startGame;
$("add-bot").onclick = addBot;
$("copy-code").onclick = async () => { try { await navigator.clipboard.writeText(state.roomCode); toast("Room code copied."); } catch { toast("Room code: " + state.roomCode); } };
$("leave-top").onclick = leaveRoom;
$("hide-role").onclick = () => { state.roleVisible = !state.roleVisible; if (state.myRole) renderRole(); };
$("go-vote").onclick = goVoting;
$("submit-vote").onclick = castVote;
$("end-round").onclick = calculateResults;
$("new-round").onclick = newRound;
$("player-list").addEventListener("click", e => {
  const b = e.target.closest(".kick"); if (!b || !isHost()) return;
  remove(roomRef(`players/${b.dataset.uid}`)).catch(() => toast("Could not remove that player."));
});
$("vote-list").addEventListener("click", e => {
  const b = e.target.closest(".vote-person");
  if (!b || b.disabled || state.room?.votes?.[state.user.uid]) return;
  state.selectedVote = b.dataset.uid; renderVote();
});

$("brand-crew").innerHTML = crew(COLORS[0]);
$("hero-crew").innerHTML = [1, 2, 0, 3, 4].map(i => crew(COLORS[i])).join("");


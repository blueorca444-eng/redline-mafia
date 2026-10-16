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
const COLORS = ["#ff4d5e","#4d7cff","#3fd17f","#ffd23f","#b16bff","#ff9a3d","#ff8fd0","#6fe3ff"];
const BOT_NAMES = ["Bleep","Bloop","Zorp","Pip","Mox","Juno"];
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const $ = id => document.getElementById(id) || (console.warn("Missing element #" + id), document.createElement("div"));
const screens = ["home-screen","entry-screen","lobby-screen","role-screen","discussion-screen","vote-screen","results-screen"];
const state = { user:null, roomCode:null, room:null, mode:"create", selectedVote:null, roleVisible:true, unsub:[], busy:false, shown:null, phaseKey:null, myRole:null, lastMafiaUid:null, offset:0, hist:{} };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
onValue(ref(db, ".info/serverTimeOffset"), snap => { state.offset = snap.val() || 0; });

const crew = (c, v = "#d8f6ff") => `<svg class="crew" viewBox="0 -4 40 48" aria-hidden="true"><path class="pack" d="M9 35C3 36 1 29 4 24" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/><rect x="7" y="31" width="11" height="11" rx="4" fill="${c}"/><rect x="22" y="31" width="11" height="11" rx="4" fill="${c}"/><rect x="7" y="2" width="26" height="34" rx="13" fill="${c}"/><path d="M8 11L9-3L19 4Z M32 11L31-3L21 4Z" fill="${c}"/><path d="M10.5 7L10.7 0.5L15.5 4.2Z M29.5 7L29.3 0.5L24.5 4.2Z" fill="#ffb3c7"/><rect x="17" y="9" width="19" height="12" rx="6" fill="${v}" stroke="#10102a" stroke-width="2"/></svg>`;
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

function getHist() { if (state.hist[state.roomCode]) return state.hist[state.roomCode]; try { return JSON.parse(localStorage.getItem("sr_hist_" + state.roomCode) || "[]"); } catch { return []; } }
function setHist(h) { state.hist[state.roomCode] = h; try { localStorage.setItem("sr_hist_" + state.roomCode, JSON.stringify(h)); } catch {} }
const rkey = () => (state.room?.round || 0) + ":" + (state.room?.startedAt || 0);
const ROLE_NAME = { mafia: "Impostor", villager: "Crewmate", joker: "Joker" };

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
  if (key !== state.phaseKey) { state.phaseKey = key; state.selectedVote = null; state.roleVisible = true; }
  $("leave-top").classList.remove("hidden");
  renderLobby();
  if (ph === "lobby") showScreen("lobby-screen");
  else if (ph === "role") loadRole();
  else if (ph === "discussion") { renderDiscussion(); startTick(); }
  else if (ph === "voting") renderVote();
  if (ph === "discussion" || ph === "voting") fetchRole().then(updateBadges);
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

let starting = false;
async function startGame() {
  if (!isHost() || starting) return;
  starting = true;
  err("lobby-error", "");
  try {
    const ps = players(), round = (state.room.round || 0) + 1;
    const hist = getHist();
    let pool = ps.filter(p => !hist.slice(-2).includes(p.uid));
    if (!pool.length) pool = ps.filter(p => p.uid !== hist[hist.length - 1]);
    if (!pool.length) pool = ps;
    const mafia = pool[Math.floor(Math.random() * pool.length)].uid;
    const others = ps.filter(p => p.uid !== mafia);
    const joker = others.length && Math.random() < 0.25 ? others[Math.floor(Math.random() * others.length)].uid : null;
    const writes = {};
    ps.forEach(p => writes[`privateRoles/${state.roomCode}/${p.uid}`] = { role: p.uid === mafia ? "mafia" : p.uid === joker ? "joker" : "villager", round });
    const rc = state.roomCode;
    writes[`gameSecrets/${rc}/mafiaUid`] = mafia + (joker ? ":" + joker : "");
    Object.assign(writes, { [`rooms/${rc}/phase`]: "role", [`rooms/${rc}/round`]: round, [`rooms/${rc}/startedAt`]: Date.now(), [`rooms/${rc}/votes`]: null, [`rooms/${rc}/results`]: null, [`rooms/${rc}/discussion`]: null });
    await update(ref(db), writes);
    setHist([...hist, mafia].slice(-2));
  } catch (e) { err("lobby-error", "Could not start game: " + e.message); } finally { starting = false; }
}

async function fetchRole() {
  const round = rkey();
  if (state.myRole?.round === round) return state.myRole.role;
  try {
    const snap = await get(ref(db, `privateRoles/${state.roomCode}/${state.user.uid}`));
    if (!snap.exists()) return null;
    state.myRole = { round, role: snap.val().role };
    return state.myRole.role;
  } catch { return null; }
}
function updateBadges() {
  const role = state.myRole?.round === rkey() ? state.myRole.role : null;
  ["role-chip-d", "role-chip-v"].forEach(id => {
    const el = $(id);
    el.textContent = role ? `Your role: ${ROLE_NAME[role] || "Crewmate"}` : "";
    el.classList.toggle("imp", role === "mafia");
    el.classList.toggle("joker", role === "joker");
    el.classList.toggle("hidden", !role);
  });
}
async function loadRole() {
  const round = rkey();
  const role = await fetchRole();
  if (!role) { toast("Could not load your private role."); return; }
  if (state.room?.phase === "role" && rkey() === round) renderRole();
}
function renderRole() {
  const role = state.myRole.role, imp = role === "mafia", jok = role === "joker", host = isHost();
  $("role-card").classList.toggle("mafia", imp);
  $("role-card").classList.toggle("joker", jok);
  $("role-symbol").innerHTML = crew(colorOf(players().find(p => p.uid === state.user.uid) || {}), imp ? "#ff8a95" : jok ? "#ffe27a" : "#d8f6ff");
  $("role-name").textContent = ROLE_NAME[role] || "Crewmate";
  $("role-description").textContent = imp ? "Blend in and steer the votes toward someone else." : jok ? "Get the crew to vote for you instead of the impostor. Look suspicious, but not too suspicious." : "Find the one person lying to everyone.";
  $("role-card").classList.toggle("hidden", !state.roleVisible);
  $("hide-role").textContent = state.roleVisible ? "Hide my role" : "Reveal my role";
  $("go-discuss").classList.toggle("hidden", !host);
  $("role-wait").classList.toggle("hidden", host);
  showScreen("role-screen");
}

const TURN_MS = 60000, BOT_MS = 6000;
const serverNow = () => Date.now() + state.offset;
const toArr = x => Array.isArray(x) ? x : Object.values(x || {});
const turnEnd = (uid, ps) => serverNow() + (ps.find(p => p.uid === uid)?.bot ? BOT_MS : TURN_MS);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function startDiscussion() {
  if (!isHost()) return;
  try {
    const ps = players(), order = shuffle(ps.map(p => p.uid));
    await update(roomRef(), { phase: "discussion", discussion: { order, idx: 0, turnEndsAt: turnEnd(order[0], ps) } });
  } catch { toast("Could not start the discussion."); }
}
function renderDiscussion() {
  showScreen("discussion-screen");
  const d = state.room.discussion || {}, order = toArr(d.order), idx = d.idx || 0, ps = players(), host = isHost(), me = state.user.uid;
  const by = uid => ps.find(p => p.uid === uid), done = idx >= order.length, cur = done ? null : by(order[idx]);
  $("discuss-round").textContent = `Round ${state.room.round || 1}`;
  $("speaker-card").innerHTML = done
    ? '<div class="speaker-name">Everyone has spoken.</div><div class="speaker-sub">Time to vote.</div>'
    : `${crew(colorOf(cur || {}))}<div class="speaker-name">${escapeHtml(cur?.name || "Someone")}${cur?.uid === me ? " (you)" : ""}</div><div class="speaker-sub">${cur?.uid === me ? "It’s your turn. Make your case!" : "is making their case"}</div>`;
  $("speak-order").innerHTML = order.map((u, i) => `<li class="${i < idx ? "past" : i === idx ? "now" : ""}">${escapeHtml(by(u)?.name || "Unknown")}</li>`).join("");
  $("next-speaker").classList.toggle("hidden", !host || done);
  $("next-speaker").textContent = cur ? `Finish ${cur.name || "player"}’s discussion` : "Next speaker";
  $("go-vote").classList.toggle("hidden", !host);
  $("go-vote").disabled = !done;
  $("discuss-wait").classList.toggle("hidden", host);
  updateBadges();
  tick();
}
let tickId = null, advancing = false;
function startTick() { if (!tickId) tickId = setInterval(tick, 250); }
function tick() {
  const r = state.room;
  if (!r || r.phase !== "discussion") { clearInterval(tickId); tickId = null; return; }
  const d = r.discussion || {}, idx = d.idx || 0;
  if (idx >= toArr(d.order).length || !d.turnEndsAt) { $("turn-timer").textContent = ""; return; }
  const left = Math.max(0, Math.ceil((d.turnEndsAt - serverNow()) / 1000));
  $("turn-timer").textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "Time’s up";
  $("next-speaker").classList.toggle("pulse", left <= 0);
  const spk = players().find(p => p.uid === toArr(d.order)[idx]);
  if (isHost() && left <= 0 && spk?.bot && !advancing) advanceTurn(idx);
}
async function advanceTurn(from) {
  if (!isHost() || advancing) return;
  advancing = true;
  try {
    const d = state.room.discussion || {}, order = toArr(d.order);
    if ((d.idx || 0) !== from) { advancing = false; return; }
    const next = from + 1;
    await update(roomRef("discussion"), { idx: next, turnEndsAt: next < order.length ? turnEnd(order[next], players()) : null });
    advancing = false;
  } catch { toast("Could not move to the next speaker."); setTimeout(() => { advancing = false; }, 3000); }
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
  updateBadges();
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
    await update(roomRef(), { phase: "results", results: { counts, max, winners, finishedAt: Date.now(), revealed: false } });
  } catch (e) { toast("Could not count votes."); } finally { calculating = false; }
}

function renderResults() {
  showScreen("results-screen");
  const r = state.room.results || {}, ps = players(), host = isHost(), rev = !!r.revealed;
  const name = uid => (ps.find(p => p.uid === uid) || {}).name || "Unknown";
  const T = { tie: ["A tie. No verdict.", "Vote tied", "The top vote count was shared. Nobody wins this round."],
    caught: ["Impostor caught!", "Crew wins", "The crew found the impostor."],
    missed: ["Wrong accusation.", "Impostor wins", "The crew voted for the wrong person."],
    joker: ["The Joker fooled you!", "Joker wins", "The crew voted out the Joker, so the impostor got away."] }[r.outcome] || [];
  $("results-title").textContent = rev ? T[0] : "The votes are in.";
  $("results-outcome").textContent = rev ? T[1] : "Votes counted";
  $("results-subtitle").textContent = rev ? T[2] : "Here’s how everyone voted. The host reveals the impostor next.";
  const sorted = Object.entries(r.counts || {}).sort((a, b) => b[1] - a[1]);
  $("results-detail").innerHTML = sorted.length ? sorted.map(([u, n]) => `${escapeHtml(name(u))}: ${n} vote${n === 1 ? "" : "s"}`).join("<br>") : "No votes were recorded.";
  $("mafia-name").textContent = rev ? name(r.mafiaUid) : "???";
  $("joker-reveal").classList.toggle("hidden", !(rev && r.jokerUid));
  $("joker-name").textContent = rev && r.jokerUid ? name(r.jokerUid) : "—";
  $("reveal-btn").classList.toggle("hidden", !host || rev);
  $("new-round").classList.toggle("hidden", !host || !rev);
  $("results-wait").classList.toggle("hidden", host);
  $("results-wait").textContent = rev ? "Waiting for the host to start another round." : "Waiting for the host to reveal the impostor.";
}
let revealing = false;
async function revealImpostor() {
  if (!isHost() || revealing) return;
  revealing = true;
  try {
    const raw = (await get(ref(db, `gameSecrets/${state.roomCode}/mafiaUid`))).val() || "";
    const [mafiaUid, jokerUid] = raw.split(":");
    const w = toArr(state.room.results?.winners);
    const win = w.length === 1 ? w[0] : null;
    const outcome = !win ? "tie" : win === jokerUid ? "joker" : win === mafiaUid ? "caught" : "missed";
    await update(roomRef("results"), { mafiaUid, jokerUid: jokerUid || null, outcome, revealed: true });
  } catch { toast("Could not reveal the impostor."); } finally { revealing = false; }
}
async function newRound() {
  if (!isHost()) return;
  try {
    await remove(ref(db, `privateRoles/${state.roomCode}`));
    await remove(ref(db, `gameSecrets/${state.roomCode}`));
    await update(roomRef(), { phase: "lobby", votes: null, results: null, discussion: null });
  } catch (e) { toast("Could not start a new round."); }
}
async function leaveRoom() {
  const c = state.roomCode, host = isHost();
  stopListeners();
  try {
    if (c && state.user) {
      if (host) { await remove(ref(db, `privateRoles/${c}`)); await remove(ref(db, `gameSecrets/${c}`)); await remove(roomRef()); }
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
$("go-discuss").onclick = startDiscussion;
$("go-vote").onclick = goVoting;
$("next-speaker").onclick = () => advanceTurn(state.room?.discussion?.idx || 0);
$("submit-vote").onclick = castVote;
$("end-round").onclick = calculateResults;
$("new-round").onclick = newRound;
$("reveal-btn").onclick = revealImpostor;
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
$("hero-crew").innerHTML = [1, 2, 0, 3, 4, 6].map(i => crew(COLORS[i])).join("");


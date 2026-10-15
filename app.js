import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getDatabase, ref, set, get, update, remove, onValue, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

// 1. Paste your Firebase web app config here (Firebase Console > Project settings).
const firebaseConfig = {
  apiKey: "AIzaSyDghAyh8h-bacUaffE4gAq4pMYkwXewz9I",
  authDomain: "mafia-34c10.firebaseapp.com",
  databaseURL: "https://mafia-34c10-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "mafia-34c10",
  storageBucket: "mafia-34c10.firebasestorage.app",
  messagingSenderId: "461103064592",
  appId: "1:461103064592:web:39ce01a6e508ad5c588c95",
  measurementId: "G-8WVC7M72Y8"
};

const $ = id => document.getElementById(id);
const screens = ["home-screen","entry-screen","lobby-screen","role-screen","vote-screen","results-screen"];
const state = { user:null, roomCode:null, room:null, mode:"create", selectedVote:null, roleVisible:true, unsub:[], busy:false };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

function showScreen(id){ screens.forEach(s => $(s).classList.toggle("hidden",s!==id)); window.scrollTo({top:0,behavior:"smooth"}); }
function toast(message){ const el=$("toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2200); }
function err(id,message){ $(id).textContent=message||""; }
function code(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function safeName(s){ return String(s||"").trim().replace(/[<>]/g,"").slice(0,18); }
function players(){ return Object.values(state.room?.players||{}).sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)); }
function isHost(){ return state.room?.hostUid===state.user?.uid; }
function roomRef(path=""){ return ref(db,`rooms/${state.roomCode}${path?"/"+path:""}`); }
function stopListeners(){ state.unsub.forEach(fn=>fn());state.unsub=[]; }
function listenRoom(){
  stopListeners();
  state.unsub.push(onValue(roomRef(),snap=>{
    if(!snap.exists()){ toast("This room no longer exists."); resetLocal(); return; }
    state.room=snap.val(); renderRoom();
    if(state.room.phase==="role") loadRole();
    if(state.room.phase==="voting") renderVote();
    if(state.room.phase==="results") renderResults();
  },e=>toast("Connection error: "+e.message)));
  state.unsub.push(onValue(roomRef("votes"),snap=>{
    if(state.room){state.room.votes=snap.val()||{};updateVoteProgress();}
  }));
}
function renderRoom(){
  if(!state.room)return;
  $("room-code-display").textContent=state.roomCode;
  const ps=players(); $("player-count").textContent=`${ps.length} / 12`;
  $("player-list").innerHTML=ps.map((p,i)=>`<div class="player-row"><div class="avatar">${escapeHtml((p.name||"?")[0].toUpperCase())}</div><span class="player-name">${escapeHtml(p.name)}</span>${p.uid===state.room.hostUid?'<span class="host-tag">HOST</span>':''}${p.uid===state.user.uid?'<span class="you-tag">YOU</span>':''}</div>`).join("");
  $("lobby-status").textContent=ps.length<3?"Need at least 3 players to start.":"Ready when you are.";
  $("start-game").classList.toggle("hidden",!isHost());
  $("start-game").disabled=ps.length<3||state.room.phase!=="lobby";
  if(state.room.phase==="lobby" && ! $("lobby-screen").classList.contains("hidden")){}
  if(state.room.phase==="role" && !$("role-screen").classList.contains("hidden")) loadRole();
  if(state.room.phase==="voting" && !$("vote-screen").classList.contains("hidden")) renderVote();
  if(state.room.phase==="results") renderResults();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function resetLocal(){stopListeners();state.roomCode=null;state.room=null;state.selectedVote=null;showScreen("home-screen");}
function openEntry(mode){state.mode=mode;$("entry-title").textContent=mode==="create"?"Create your room":"Join a room";$("entry-subtitle").textContent=mode==="create"?"Set a nickname and open your private lobby.":"Enter the room code your friend shared."; $("entry-submit").innerHTML=mode==="create"?'Create room <span>→</span>':'Join room <span>→</span>'; $("room-code-wrap").classList.toggle("hidden",mode==="create");err("entry-error","");showScreen("entry-screen");}
async function enterRoom(e){
 e.preventDefault(); if(state.busy)return; state.busy=true;
 const name=safeName($("nickname").value); if(!name){state.busy=false;return;}
 try{
  if(!state.user) throw new Error("Still connecting to Firebase. Check your configuration.");
  if(state.mode==="create"){
   let c; do{c=code();}while((await get(ref(db,`rooms/${c}`))).exists());
   state.roomCode=c;
   await set(roomRef(),{hostUid:state.user.uid,phase:"lobby",createdAt:Date.now(),players:{[state.user.uid]:{uid:state.user.uid,name,joinedAt:Date.now()}}});
  }else{
   const c=$("room-code").value.trim().toUpperCase(); if(!/^[A-Z0-9]{6}$/.test(c))throw new Error("Enter the 6-character room code.");
   state.roomCode=c;const snap=await get(roomRef());
   if(!snap.exists())throw new Error("Room not found. Check the code and try again.");
   const room=snap.val();if(room.phase!=="lobby")throw new Error("This game has already started.");
   if(Object.keys(room.players||{}).length>=12)throw new Error("This room is full.");
   await set(roomRef(`players/${state.user.uid}`),{uid:state.user.uid,name,joinedAt:Date.now()});
  }
  listenRoom();showScreen("lobby-screen");
 }catch(ex){err("entry-error",ex.message||"Could not enter the room.");state.roomCode=null;}
 finally{state.busy=false;}
}
async function startGame(){
 if(!isHost()||players().length<3)return;
 try{
  const ps=players();const mafia=ps[Math.floor(Math.random()*ps.length)].uid;
  const roleWrites={};ps.forEach(p=>roleWrites[`privateRoles/${state.roomCode}/${p.uid}`]={role:p.uid===mafia?"mafia":"villager",round:(state.room.round||0)+1});
  await update(ref(db),roleWrites);
  await set(ref(db,`gameSecrets/${state.roomCode}`),{mafiaUid:mafia});
  await update(roomRef(),{phase:"role",round:(state.room.round||0)+1,startedAt:Date.now(),votes:{},results:null});
 }catch(e){err("lobby-error","Could not start game: "+e.message);}
}
async function loadRole(){
 if(!state.room||state.room.phase!=="role")return;
 try{
  const snap=await get(ref(db,`privateRoles/${state.roomCode}/${state.user.uid}`));if(!snap.exists())return;
  const role=snap.val().role;state.myRole=role;
  $("role-card").classList.toggle("mafia",role==="mafia");
  $("role-symbol").textContent=role==="mafia"?"♠":"✦";
  $("role-name").textContent=role==="mafia"?"THE MAFIA":"VILLAGER";
  $("role-description").textContent=role==="mafia"?"Blend in. Convince them to vote for someone else.":"Find the one person lying to everyone.";
  $("role-card").classList.toggle("hidden",!state.roleVisible);
  $("hide-role").textContent=state.roleVisible?"Hide my role":"Reveal my role";
  $("go-vote").classList.toggle("hidden",!state.roleVisible);
  showScreen("role-screen");
 }catch(e){toast("Could not load your private role.");}
}
async function goVoting(){if(!isHost())return;await update(roomRef(),{phase:"voting",votes:{},votingStartedAt:Date.now()});}
function renderVote(){
 if(state.room?.phase!=="voting")return;showScreen("vote-screen");
 const ps=players();const votes=state.room.votes||{};const mine=votes[state.user.uid];
 state.selectedVote=mine?.targetUid||state.selectedVote;
 $("vote-list").innerHTML=ps.filter(p=>p.uid!==state.user.uid).map(p=>`<button class="vote-person ${state.selectedVote===p.uid?"selected":""}" data-uid="${p.uid}" ${mine?"disabled":""}><span class="vote-check">${state.selectedVote===p.uid?"✓":""}</span><span class="avatar">${escapeHtml(p.name[0].toUpperCase())}</span><b>${escapeHtml(p.name)}</b><small>${p.uid===state.room.hostUid?"HOST":"PLAYER"}</small></button>`).join("");
 document.querySelectorAll(".vote-person").forEach(b=>b.addEventListener("click",()=>{if(!state.room.votes?.[state.user.uid]){state.selectedVote=b.dataset.uid;renderVote();}}));
 $("submit-vote").disabled=!state.selectedVote||!!mine;
 $("submit-vote").textContent=mine?"Vote locked":"Lock in vote →";
 updateVoteProgress();
}
function updateVoteProgress(){
 if(!state.room)return;const votes=state.room.votes||{};const count=Object.keys(votes).length;
 $("votes-cast").textContent=count;$("votes-total").textContent=players().length;
 $("vote-status").textContent=count===players().length?"All votes are in. Counting…":`${players().length-count} player${players().length-count===1?"":"s"} still to vote`;
 if(isHost()&&count===players().length&&players().length>0&&state.room.phase==="voting")calculateResults();
}
let calculating=false;
async function castVote(){
 const target=state.selectedVote;if(!target||!state.room||state.room.votes?.[state.user.uid])return;
 try{
  await set(roomRef(`votes/${state.user.uid}`),{voterUid:state.user.uid,targetUid:target,at:Date.now()});
  $("submit-vote").disabled=true;toast("Vote locked in.");
 }catch(e){err("vote-error",e.message);}
}
async function calculateResults(){
 if(calculating||!isHost())return;calculating=true;
 try{
  const snap=await get(roomRef("votes"));const votes=snap.val()||{};const counts={};
  Object.values(votes).forEach(v=>counts[v.targetUid]=(counts[v.targetUid]||0)+1);
  const max=Math.max(0,...Object.values(counts));const winners=Object.keys(counts).filter(uid=>counts[uid]===max);
  const secretSnap=await get(ref(db,`gameSecrets/${state.roomCode}/mafiaUid`));
  const mafiaUid=secretSnap.val();
  const outcome=max===0||winners.length!==1?"tie":(winners[0]===mafiaUid?"mafia_caught":"villagers_wrong");
  await update(roomRef(),{phase:"results",results:{counts,max,winners,outcome,mafiaUid,finishedAt:Date.now()}});
 }catch(e){toast("Could not count votes.");}finally{calculating=false;}
}
function renderResults(){
 if(!state.room||state.room.phase!=="results")return;showScreen("results-screen");
 const r=state.room.results||{};const ps=players();const names=uid=>(ps.find(p=>p.uid===uid)||{}).name||"Unknown";
 const title=r.outcome==="tie"?"A tie. No verdict.":r.outcome==="mafia_caught"?"Mafia exposed.": "Wrong accusation.";
 $("results-title").textContent=title;$("results-outcome").textContent=r.outcome==="tie"?"VOTE TIED":r.outcome==="mafia_caught"?"MAFIA CAUGHT":"VILLAGERS MISSED";
 $("results-subtitle").textContent=r.outcome==="tie"?"The highest vote count was shared. Nobody wins this round.":"The room has spoken. Here's how everyone voted.";
 const counts=r.counts||{};const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
 $("results-detail").innerHTML=sorted.length?sorted.map(([uid,n])=>`${escapeHtml(names(uid))} — ${n} vote${n===1?"":"s"}`).join("<br>"):"No votes were recorded.";
 $("mafia-name").textContent=names(r.mafiaUid);
 $("new-round").classList.toggle("hidden",!isHost());$("back-lobby").classList.toggle("hidden",!isHost());
}
async function newRound(){
 if(!isHost())return;
 const updates={phase:"lobby",votes:{},results:null};
 await update(roomRef(),updates);
 const snap=await get(ref(db,`privateRoles/${state.roomCode}`));
 if(snap.exists())await remove(ref(db,`privateRoles/${state.roomCode}`));await remove(ref(db,`gameSecrets/${state.roomCode}`));
 showScreen("lobby-screen");
}
async function leaveRoom(){
 try{if(state.roomCode&&state.user){await remove(roomRef(`players/${state.user.uid}`));if(isHost())await remove(roomRef());}}catch{}
 resetLocal();
}
$("show-create").onclick=()=>openEntry("create");$("show-join").onclick=()=>openEntry("join");$("back-home").onclick=()=>showScreen("home-screen");$("entry-form").addEventListener("submit",enterRoom);
$("start-game").onclick=startGame;$("copy-code").onclick=async()=>{try{await navigator.clipboard.writeText(state.roomCode);toast("Room code copied.");}catch{toast("Room code: "+state.roomCode);}};
$("leave-room").onclick=leaveRoom;$("hide-role").onclick=()=>{state.roleVisible=!state.roleVisible;loadRole();};
$("go-vote").onclick=goVoting;$("submit-vote").onclick=castVote;$("back-lobby").onclick=()=>showScreen("lobby-screen");$("new-round").onclick=newRound;

// Anonymous auth is required so Firebase rules can isolate private roles per player.
signInAnonymously(auth).catch(e=>{console.error(e);toast("Firebase sign-in failed. Check setup instructions.");});
onAuthStateChanged(auth,user=>{state.user=user;if(user)console.info("Firebase connected; anonymous player UID ready.");});

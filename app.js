const socket=io();
const $=id=>document.getElementById(id);
let roomCode=null, roomState=null, myId=null, toastTimer=null, tick=null;
socket.on("connect",()=>{$("connection").textContent="● ONLINE";$("connection").className="pill ok";myId=socket.id;});
socket.on("disconnect",()=>{$("connection").textContent="● RECONNECTING";$("connection").className="pill muted";});
socket.on("state",state=>{roomState=state;render();});
socket.on("notice",msg=>toast(msg));
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2800);}
function show(id){["home","lobby","game","results"].forEach(x=>$(x).classList.toggle("hidden",x!==id));}
function playerName(){return $("playerName").value.trim().slice(0,18)||"Player";}
$("createBtn").onclick=()=>socket.emit("createRoom",{name:playerName()},res=>{if(!res.ok)return toast(res.error);roomCode=res.code;$("roomLabel").textContent=roomCode;show("lobby");});
$("joinBtn").onclick=()=>{const c=$("roomCode").value.trim().toUpperCase();if(!c)return toast("Enter a room code.");socket.emit("joinRoom",{code:c,name:playerName()},res=>{if(!res.ok)return toast(res.error);roomCode=res.code;$("roomLabel").textContent=roomCode;show("lobby");});};
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);toast("Room code copied.");}catch{toast("Room code: "+roomCode);}};
$("startBtn").onclick=()=>socket.emit("startGame",res=>{if(!res?.ok)toast(res?.error||"Could not start.");});
$("leaveBtn").onclick=()=>{location.reload();};
$("homeBtn").onclick=()=>location.reload();
function render(){
 if(!roomState)return;
 $("lobbyCount").textContent=`${roomState.players.length}/20`;
 $("playerList").innerHTML=roomState.players.map(p=>`<div class="player"><span>${escapeHtml(p.name)} ${p.isHost?'<span class="host">HOST</span>':''}</span><span>${p.role==="waiting"?"READY":p.alive?"IN GAME":"OUT"}</span></div>`).join("");
 const isHost=roomState.hostId===myId;
 $("startBtn").classList.toggle("hidden",!isHost);
 $("lobbyHint").textContent=roomState.players.length<5?`Need ${5-roomState.players.length} more player(s) to start.`:isHost?"You are the host. Start when everyone is ready.":"Waiting for the host to start the match.";
 if(roomState.status==="lobby"){show("lobby");return;}
 if(roomState.status==="playing"){show("game");renderGame();return;}
 if(roomState.status==="finished"){show("results");$("winnerTitle").textContent=roomState.winner==="survivors"?"SURVIVORS WIN":"HUNTERS WIN";$("winnerText").textContent="The match has ended. Thanks for playing HUNTZONE.";return;}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fmt(ms){const sec=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`;}
function renderGame(){
 const me=roomState.players.find(p=>p.id===myId);if(!me)return;
 const survivors=roomState.players.filter(p=>p.role==="survivor"&&p.alive).length;
 const hunters=roomState.players.filter(p=>p.role==="hunter"&&p.alive).length;
 $("survivorCount").textContent=survivors;$("hunterCount").textContent=hunters;
 $("aliveCount").textContent=survivors+hunters;$("stageLabel").textContent=`ZONE ${roomState.zoneStage+1} / 6`;
 $("zoneLabel").textContent=`SAFE ZONE · ${(roomState.zoneRadius/1000).toFixed(1)} KM`;
 $("roleName").textContent=me.role.toUpperCase();
 $("roleHelp").textContent=me.role==="hunter"?"Tag survivors when they are close. Your virtual avatar moves faster.":"Stay inside the safe zone and avoid hunter markers. Survive until the timer ends.";
 $("roleCard").classList.toggle("hunter",me.role==="hunter");
 $("statusLabel").textContent=me.alive?"ACTIVE":"ELIMINATED";
 const max=10000, size=96, zonePct=Math.max(10,roomState.zoneRadius/5000*96);
 $("zoneCircle").style.width=zonePct+"%";$("zoneCircle").style.height=zonePct+"%";$("zoneCircle").style.left=(50-zonePct/2)+"%";$("zoneCircle").style.top=(50-zonePct/2)+"%";
 $("playersLayer").innerHTML=roomState.players.map(p=>{
  const x=50+(p.x/max)*48,y=50+(p.y/max)*48;
  const cls=!p.alive?"dead":p.role;
  return `<div class="marker ${cls} ${p.id===myId?"you":""}" style="left:${Math.max(2,Math.min(98,x))}%;top:${Math.max(2,Math.min(98,y))}%" title="${escapeHtml(p.name)}"><span class="marker-label">${p.id===myId?"YOU":escapeHtml(p.name)}</span></div>`;
 }).join("");
 const now=Date.now();$("timer").textContent=fmt(roomState.endsAt-now);
 $("zoneTimer").textContent=roomState.nextShrinkAt?fmt(roomState.nextShrinkAt-now):"FINAL";
 const targets=roomState.players.filter(p=>p.role==="survivor"&&p.alive);
 $("hunterActions").classList.toggle("hidden",me.role!=="hunter"||!me.alive);
 $("targetList").innerHTML=targets.map(p=>`<div class="target"><span>${escapeHtml(p.name)}</span><button data-tag="${p.id}">TAG</button></div>`).join("")||"<p>No survivors remain.</p>";
 document.querySelectorAll("[data-tag]").forEach(b=>b.onclick=()=>socket.emit("tagPlayer",{targetId:b.dataset.tag},r=>{if(!r?.ok)toast(r?.error||"Tag failed.");}));
}
const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
document.querySelectorAll("[data-dir]").forEach(btn=>{
 const move=()=>{const d=dirs[btn.dataset.dir];socket.emit("move",{dx:d[0],dy:d[1]});};
 btn.addEventListener("click",move);
 btn.addEventListener("touchstart",e=>{e.preventDefault();move();},{passive:false});
});
setInterval(()=>{if(roomState?.status==="playing")renderGame();},500);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
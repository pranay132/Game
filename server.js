const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const MAX_PLAYERS = 20, MIN_PLAYERS = 5;
const ZONES = [5000, 4000, 3000, 2000, 1000, 500]; // virtual metres
const SHRINK_EVERY = 5 * 60 * 1000;
const GAME_LENGTH = 30 * 60 * 1000;

function code() { return crypto.randomBytes(3).toString("hex").toUpperCase(); }
function safeRoom(room) {
  return {
    code: room.code, status: room.status, hostId: room.hostId,
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, role:p.role, alive:p.alive,
      x:p.x, y:p.y, isHost:p.id===room.hostId
    })),
    zoneRadius: room.zoneRadius, zoneStage: room.zoneStage,
    nextShrinkAt: room.nextShrinkAt, endsAt: room.endsAt,
    startedAt: room.startedAt, winner: room.winner
  };
}
function broadcast(room) { io.to(room.code).emit("state", safeRoom(room)); }
function getRoom(socket) {
  const c=socket.data.roomCode;
  return c && rooms.get(c);
}
function finish(room, winner) {
  if (room.status !== "playing") return;
  room.status="finished"; room.winner=winner; room.nextShrinkAt=null;
  broadcast(room);
  io.to(room.code).emit("notice", winner==="survivors" ? "Survivors win!" : "Hunters win!");
}
function startGame(room) {
  if (room.players.size < MIN_PLAYERS) return false;
  const list=[...room.players.values()];
  const hunterCount=Math.random()<0.5?1:2;
  const shuffled=[...list].sort(()=>Math.random()-0.5);
  shuffled.forEach((p,i)=>{p.role=i<hunterCount?"hunter":"survivor";p.alive=true;});
  room.status="playing"; room.startedAt=Date.now(); room.endsAt=Date.now()+GAME_LENGTH;
  room.zoneStage=0; room.zoneRadius=ZONES[0]; room.nextShrinkAt=Date.now()+SHRINK_EVERY;
  room.winner=null;
  // Virtual arena coordinates are in metres from the centre; no real-world location is collected.
  for (const p of list) { p.x=Math.round((Math.random()-.5)*3000); p.y=Math.round((Math.random()-.5)*3000); }
  return true;
}
setInterval(()=>{
  const now=Date.now();
  for (const room of rooms.values()) {
    if(room.status!=="playing") continue;
    if(now>=room.endsAt){finish(room,"survivors");continue;}
    if(room.nextShrinkAt && now>=room.nextShrinkAt){
      room.zoneStage=Math.min(room.zoneStage+1,ZONES.length-1);
      room.zoneRadius=ZONES[room.zoneStage];
      room.nextShrinkAt=room.zoneStage===ZONES.length-1?null:now+SHRINK_EVERY;
      // Players outside the new virtual circle are marked out.
      for(const p of room.players.values()){
        if(p.alive && Math.hypot(p.x,p.y)>room.zoneRadius) p.alive=false;
      }
      io.to(room.code).emit("notice",`Zone shrunk! New radius: ${(room.zoneRadius/1000).toFixed(1)} km`);
    }
    const alive=[...room.players.values()].filter(p=>p.alive);
    const survivors=alive.filter(p=>p.role==="survivor").length;
    const hunters=alive.filter(p=>p.role==="hunter").length;
    if(survivors===0) finish(room,"hunters");
    else if(hunters===0) finish(room,"survivors");
    else broadcast(room);
  }
},1000);

io.on("connection",socket=>{
  socket.on("createRoom",({name},cb)=>{
    const roomCode=code();
    const player={id:socket.id,name:String(name||"Player").slice(0,18),role:"waiting",alive:true,x:0,y:0};
    const room={code:roomCode,hostId:socket.id,players:new Map([[socket.id,player]]),status:"lobby",zoneRadius:5000,zoneStage:0,nextShrinkAt:null,endsAt:null,startedAt:null,winner:null};
    rooms.set(roomCode,room); socket.join(roomCode); socket.data.roomCode=roomCode;
    cb({ok:true,code:roomCode}); broadcast(room);
  });
  socket.on("joinRoom",({code:raw,name},cb)=>{
    const c=String(raw||"").trim().toUpperCase(), room=rooms.get(c);
    if(!room) return cb({ok:false,error:"Room not found."});
    if(room.status!=="lobby") return cb({ok:false,error:"This game has already started."});
    if(room.players.size>=MAX_PLAYERS) return cb({ok:false,error:"Room is full (20 players maximum)."});
    const player={id:socket.id,name:String(name||"Player").slice(0,18),role:"waiting",alive:true,x:0,y:0};
    room.players.set(socket.id,player); socket.join(c); socket.data.roomCode=c;
    cb({ok:true,code:c}); broadcast(room);
  });
  socket.on("startGame",cb=>{
    const room=getRoom(socket);
    if(!room) return cb?.({ok:false,error:"Join a room first."});
    if(room.hostId!==socket.id) return cb?.({ok:false,error:"Only the host can start."});
    if(room.players.size<MIN_PLAYERS) return cb?.({ok:false,error:"At least 5 players are required."});
    if(!startGame(room)) return cb?.({ok:false,error:"Could not start."});
    broadcast(room); io.to(room.code).emit("notice","Game started! Check your role.");
    cb?.({ok:true});
  });
  socket.on("move",({dx,dy})=>{
    const room=getRoom(socket); if(!room||room.status!=="playing") return;
    const p=room.players.get(socket.id); if(!p||!p.alive) return;
    // Virtual controls only. Hunter speed advantage is simulated, not a real vehicle.
    const speed=p.role==="hunter"?180:110;
    const len=Math.hypot(Number(dx)||0,Number(dy)||0)||1;
    p.x=Math.max(-5000,Math.min(5000,p.x+(Number(dx)||0)/len*speed));
    p.y=Math.max(-5000,Math.min(5000,p.y+(Number(dy)||0)/len*speed));
    if(Math.hypot(p.x,p.y)>room.zoneRadius) p.alive=false;
    broadcast(room);
  });
  socket.on("tagPlayer",({targetId},cb)=>{
    const room=getRoom(socket); if(!room||room.status!=="playing") return;
    const hunter=room.players.get(socket.id), target=room.players.get(targetId);
    if(!hunter||!target||hunter.role!=="hunter"||!hunter.alive||target.role!=="survivor"||!target.alive) return cb?.({ok:false,error:"Invalid tag."});
    if(Math.hypot(hunter.x-target.x,hunter.y-target.y)>350) return cb?.({ok:false,error:"Get closer (within 350 virtual metres)."});
    target.alive=false; io.to(room.code).emit("notice",`${target.name} was tagged in-game.`);
    const survivors=[...room.players.values()].filter(p=>p.role==="survivor"&&p.alive).length;
    if(survivors===0) finish(room,"hunters"); else broadcast(room);
    cb?.({ok:true});
  });
  socket.on("disconnect",()=>{
    const room=getRoom(socket); if(!room)return;
    room.players.delete(socket.id);
    if(room.players.size===0) rooms.delete(room.code);
    else {
      if(room.hostId===socket.id) room.hostId=room.players.keys().next().value;
      broadcast(room);
    }
  });
});
server.listen(PORT,()=>console.log(`HUNTZONE running at http://localhost:${PORT}`));
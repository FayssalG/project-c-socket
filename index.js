const fs = require('fs')
const fns = require('date-fns');
const axios = require('axios')
const express = require('express')
const http = require('http')
// const https = require('https')
const {Server} = require('socket.io')
const app = express()

// const key = fs.readFileSync('devCert.key');
// const cert = fs.readFileSync('devCert.crt');
// const server = https.createServer({key,cert},app)

const server = http.createServer(app)

//Change this in prod
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
/*......................*/

const BACKEND_URL = 'https://project-c-backend.vercel.app/_api'  /*'https://192.168.1.13:8000/_api'*/;
const backend = axios.create({
    baseURL : BACKEND_URL,
})

const io = new Server(server , { 
    cors :{
    origin: '*'
    },
    headers : {
        "Accept" : "application/json",
        "Content-Type" : "application/json"
    }
})

global.io = io

const connectedUsersSockets = new Map();

io.on('connection' , (socket)=>{
    const {userId , username , groupIds} = socket.handshake.query
    console.log(socket.handshake.query)
    const groupIdsArr = [...groupIds].filter(gId=>Number(gId)!=NaN).map((gId)=>Number(gId))
    socket.join([username , ...groupIdsArr]);
    connectedUsersSockets.set(userId , socket);

    global.io.emit('online-status-change' , {userId,onlineStatus:'online'});
    backend.get(`/user/online-status?user_id=${userId}&online_status=online`)
    .catch((err)=>console.log(err.response))
    
    socket.on('disconnect' , ()=>{
        const onlineStatus = fns.format(new Date() , "'Last seen ' eeee 'at' HH:mm") ;
       
        global.io.emit('online-status-change' , {userId,onlineStatus});
       
        backend.get(`/api/user/online-status?user_id=${userId}&online_status=${onlineStatus}` )
        .catch((err)=>console.log(err))
    })



    //handling calls    
    socket.on('call' , ({from , to , signal , callType })=>{
        console.log({callType})
        io.in(to).emit('receiving-call' , {from , signal , callType })
    })

    socket.on('cancel' , (to)=>{
        io.in(to).emit('cancel-receiving-call')
    })

    socket.on('end' , (to)=>{
        io.in(to).emit('call-ended');
    })
   
    socket.on('answer' , ({to , signal , callType})=>{
        io.in(to).emit('call-accepted' , signal)
    })
    
    socket.on('reject' , (to)=>{
        const message = 'Call Rejected'
        io.in(to).emit('call-rejected' , message)
    })
    
    
    socket.on('busy' , (to)=>{
        console.log({to})
        io.in(to).emit('call-rejected')
    })
    
});


app.use(express.json())

app.post('/user-connected' , (req , res)=>{
    const {userId , onlineStatus} = req.body;
    console.log(userId);
    global.io.in(req.body.to).emit('online-status-change' , {userId,onlineStatus});
    res.send('ok');
});

app.post('/user-disconnected' , (req , res)=>{
    const {userId,onlineStatus} = req.body;
    console.log({userId,onlineStatus});
    global.io.in(req.body.to).emit('online-status-change' , {userId,onlineStatus});
    res.send('ok');
});


app.post('/request-sent' , (req , res)=>{
    global.io.in(req.body.to).emit('request-received' , req.body.friend_request );
    res.send('ok');
});

app.post('/request-deleted' , (req , res)=>{
    const {to , request_id} = req.body
    console.log({to})
    global.io.in(to).emit('request-deleted' , request_id );
    res.send('ok');
});

app.post('/request-accepted' , (req , res)=>{
    const {friend , to , request_id} = req.body
    console.log(friend)
    console.log({to})
    global.io.in(to).emit('request-accepted' , {friend , request_id} );
    res.send('ok');
});

app.post('/friend-removed' , (req , res)=>{
    const {friendship_id} = req.body
    console.log({friendship_id})
    global.io.emit('friend-removed' , friendship_id );
    res.send('ok');
});

app.post('/message-sent' , (req , res)=>{
    console.log({BODY:req.body})
    global.io.in(req.body.to).emit('message-received' , {message:req.body.message , sender:req.body.sender} );
    res.send('ok');
});

app.post('/messages-seen' , (req , res)=>{
    console.log({conversationId:req.body})
    global.io.in(req.body.to).emit('messages-seen' , req.body.conversationId );
    res.send('ok');
});



app.post('/message-updated' , (req , res)=>{
    global.io.in(req.body.to).emit('message-updated' , {message:req.body.message} );
    res.send('ok');
});


app.post('/message-deleted' , (req , res)=>{
    global.io.in(req.body.to).emit('message-deleted' , {message:req.body.message} );
    res.send('ok');
});



app.post('/groups/members-added' , (req , res)=>{
    console.log({ids:req.body.new_members_ids})
    global.io.in(req.body.toGroup).emit('members-added-to-group');

    req.body.new_members_ids.forEach(id => {
        const socket = connectedUsersSockets.get(id.toString());
        socket.emit('me-added-to-group' );
        socket?.join(req.body.toGroup);
    });
    res.send('ok');
});

app.post('/groups/member-removed' , (req , res)=>{
    global.io.in(req.body.toGroup).emit('member-removed-from-group');
    res.send('ok');
});


app.post('/groups/message-sent' , (req , res)=>{
    console.log({BODY:req.body})
    global.io.in(req.body.toGroup).emit('group-message-received' , {groupMessage:req.body.groupMessage} );
    res.send('ok');
});

app.post('/groups/message-updated' , (req , res)=>{
    global.io.in(req.body.toGroup).emit('group-message-updated' , {groupMessage:req.body.groupMessage} );
    res.send('ok');
});

app.post('/groups/message-deleted' , (req , res)=>{
    global.io.in(req.body.toGroup).emit('group-message-deleted' , {groupMessage:req.body.groupMessage} );
    res.send('ok');
});

const port = process.env.PORT || 5000
server.listen(port , ()=>{
    console.log('Listenning on  *:'+port)
})

app.get('/' , (req,res)=>{
    res.send('Up and running');
})
const app = require('express')()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const next = require('next')
const uuid = require('uuid/v4')

const dev = process.env.NODE_ENV !== 'production'
const nextApp = next({dev})
const nextHandler = nextApp.getRequestHandler()

let sockets = {}

io.on('connect', (socket) => {
  let id = uuid()

  console.log(`Client ${id} has connected`)

  sockets[id] = socket

  socket.emit('connected', {uuid: id})

  socket.on('disconnect', () => {
    console.log(`Client ${id} has disconnected`)
    delete sockets[id]
  })

  socket.on('webrtc-connect', (data) => {
    if(!sockets[data.file]){
      socket.emit('bad-file-uuid')
    }else{
      sockets[data.file].emit('peer-uuid', {uuid: id})
      socket.emit('join-rtc')
    }
  })

  socket.on('connection-offer', (data) => {
    console.log(`forwarding offer from ${data.local} to ${data.remote}`)
    sockets[data.remote].emit('connection-offer', data)
  })

  socket.on('connection-answer', (data) => {
    console.log(`sending answer from ${data.local} to ${data.remote}`)
    sockets[data.remote].emit('connection-answer', data)
  })

  socket.on('open-data-channel', (data) => {
    console.log('Opening data channel')
    sockets[data.peer].emit('open-data-channel')
  })
})

nextApp.prepare().then(() => {
  app.get('/file/:file', (req, res) => {
    nextApp.render(req, res, '/index', {file: req.params.file})
  })

  app.get('*', (req, res) => {
    return nextHandler(req, res)
  })

  server.listen(3000, (err) => {
    if(err) throw err
    console.log('Listening on port 3000')
  })
})

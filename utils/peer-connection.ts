import Peer from 'simple-peer'

//import {logFn} from '../utils/log'

//const log = logFn('PeerConnection')

type MessageHandler = (data: any) => void

export class PeerConnection{
  socket: SocketIOClient.Socket
  localUUID: string
  remoteUUID: string
  peerConnection: Peer.Instance
  handlers: {[event: string]: MessageHandler}

  constructor(initiator: boolean, socket: SocketIOClient.Socket, localUUID: string, remoteUUID: string, dataChannel: string){
    this.socket = socket
    this.localUUID = localUUID
    this.remoteUUID = remoteUUID
    this.handlers = {}

    this.peerConnection = Peer({
      initiator,
      trickle: false,
      channelName: dataChannel
    })

    this.peerConnection.on('signal', (data) => {
      if(data.type === 'offer'){
        this.socket.emit('connection-offer', {
          local: this.localUUID,
          remote: this.remoteUUID,
          signal: data
        })
      }

      if(data.type === 'answer'){
        this.socket.emit('connection-answer', {
          local: this.localUUID,
          remote: this.remoteUUID,
          signal: data
        })
      }
    })

    this.socket.on('connection-offer', (data: {signal: Peer.SignalData}) => {
      this.peerConnection.signal(data.signal)
    })

    this.socket.on('connection-answer', (data: {signal: Peer.SignalData}) => {
      this.peerConnection.signal(data.signal)
    })

    this.peerConnection.on('connect', () => {
      this.emit('welcome')
    })

    this.peerConnection.on('data', (json) => {
      const event = JSON.parse('' + json)

      if(this.handlers[event.event]){
        this.handlers[event.event](event.data)
      }
    })
  }

  on(event: string, handler: MessageHandler){
    this.handlers[event] = handler
  }

  emit(event: string, data: any = {}){
    const json = JSON.stringify({
      event,
      data
    })

    this.peerConnection.send(json)
  }
}
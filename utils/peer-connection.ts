import Peer from 'simple-peer'

//import {logFn} from '../utils/log'

//const log = logFn('PeerConnection')

type MessageHandler = (data: any) => void

/**
 * A helper class that handles creating and maintaing the WebRTC connection.
 */
export class PeerConnection{
  socket: SocketIOClient.Socket
  localUUID: string
  remoteUUID: string
  peerConnection: Peer.Instance
  handlers: {[event: string]: MessageHandler}

  constructor(
    /** Is this the _host_ browser. */
    initiator: boolean,
    /** The socket.io instance. */
    socket: SocketIOClient.Socket,
    /** The UUID for this browser. */
    localUUID: string,
    /** The UUID for the browser to connect to. */
    remoteUUID: string,
    /** The data channel name to use. */
    dataChannel: string
  ){
    this.socket = socket
    this.localUUID = localUUID
    this.remoteUUID = remoteUUID
    this.handlers = {}

    this.peerConnection = Peer({
      initiator,
      trickle: false,
      channelName: dataChannel,
      config: {
        iceServers: [
          {urls:'stun:stun01.sipphone.com'},
          {urls:'stun:stun.ekiga.net'},
          {urls:'stun:stun.fwdnet.net'},
          {urls:'stun:stun.ideasip.com'},
          {urls:'stun:stun.iptel.org'},
          {urls:'stun:stun.rixtelecom.se'},
          {urls:'stun:stun.schlund.de'},
          {urls:'stun:stun.l.google.com:19302'},
          {urls:'stun:stun1.l.google.com:19302'},
          {urls:'stun:stun2.l.google.com:19302'},
          {urls:'stun:stun3.l.google.com:19302'},
          {urls:'stun:stun4.l.google.com:19302'},
          {urls:'stun:stunserver.org'},
          {urls:'stun:stun.softjoys.com'},
          {urls:'stun:stun.voiparound.com'},
          {urls:'stun:stun.voipbuster.com'},
          {urls:'stun:stun.voipstunt.com'},
          {urls:'stun:stun.voxgratia.org'},
          {urls:'stun:stun.xten.com'},
          {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
          },
          {
              urls: 'turn:192.158.29.39:3478?transport=udp',
              credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
              username: '28224511:1379330808'
          },
          {
              urls: 'turn:192.158.29.39:3478?transport=tcp',
              credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
              username: '28224511:1379330808'
          }
        ]
      }
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
import React, {useState} from 'react'
import io from 'socket.io-client'
import {withRouter} from 'next/router'
import styled from '@emotion/styled'
import {injectGlobal} from 'emotion'
import filesize from 'filesize'
import {encode, decode} from 'base-64'

import {log} from '../utils/log'
import {PeerConnection} from '../utils/peer-connection'


injectGlobal`
  body{
    background-color:#99bbff;
  }
`

const Container = styled('div')`
  background-color:#fff;
  width:500px;
  margin:auto;
  padding:10px;
`

interface IndexPageProps{
  router: {
    query: {
      file: string | undefined
    }
  }
}

const BLOCK_SIZE = 102400 //524288

class IndexPage extends React.Component<IndexPageProps, {
  uuid: string
  connectedToService: boolean
  connectedToPeer: boolean
  peer: string
  file: FileList
  complete: boolean
  fileSize: number
  fileSent: number
}>{
  constructor(props: IndexPageProps){
    super(props)

    this.state = {
      uuid: '',
      connectedToService: false,
      connectedToPeer: false,
      peer: this.props.router.query.file ? this.props.router.query.file : '',
      file: (null as any),
      complete: false,
      fileSize: 0,
      fileSent: 0
    }
  }

  componentDidMount(){
    const socket = io()
    let rtc: PeerConnection

    const connect = (host: boolean) => {
      const dataChannel = host ? `${this.state.uuid}-${this.state.peer}` : `${this.state.peer}-${this.state.uuid}`
      rtc = new PeerConnection(host, socket, this.state.uuid, this.state.peer, dataChannel)

      rtc.on('welcome', () => {
        log('Connected to peer')
        this.setState({connectedToPeer: true})
        
        if(host){
          this.sendFile(rtc)
        }else{
          this.recvFile(rtc)
        }
      })
    }

    socket.on('connected', (data: {uuid: string}) => {
      log(`Connected as client ${data.uuid}`)
      this.setState({uuid: data.uuid, connectedToService: true})

      if(this.props.router.query.file){
        socket.emit('webrtc-connect', {file: this.props.router.query.file})
      }
    })

    socket.on('peer-uuid', (data: {uuid: string}) => {
      log(`Peer ${data.uuid} connected`)
      this.setState({peer: data.uuid})
      connect(true)
    })

    socket.on('join-rtc', () => {
      connect(false)
    })

    socket.on('bad-peer-uuid', () => {
      console.error('Peer is not valid')
    })
  }

  sendFile(rtc: PeerConnection){
    const fileInTransit = this.state.file[0]
    const fileReader = new FileReader()

    rtc.on('more-data', (data: {block: number}) => {
      log(`Sending block ${data.block}`)
      const start = data.block * BLOCK_SIZE
      const slice = fileInTransit.slice(start, (start + Math.min(BLOCK_SIZE, fileInTransit.size - (data.block * BLOCK_SIZE))))
      
      if(slice.size <= 0){
        rtc.emit('end')
        this.setState({complete: true})
        return
      }
      
      fileReader.readAsBinaryString(slice)

      fileReader.onload = (event) => {
        this.setState({fileSent: data.block * BLOCK_SIZE})
        //const buffer = stringToArrayBuffer((event.target as any).result)
        //console.dir({data: buffer, block: data.block, size: slice.size})
        rtc.emit('data', {data: encode((event.target as any).result), block: data.block, size: slice.size})
      }
    })

    rtc.on('ready', () => {
      this.setState({fileSize: fileInTransit.size})
      rtc.emit('ready', {fileName: fileInTransit.name, size: fileInTransit.size})
    })
  }

  recvFile(rtc: PeerConnection){
    log('Requesting File')

    const interval = setInterval(() => rtc.emit('ready'), 200)
    const fileBuffer: any[] = []
    let fileName = 'unknown'
    let fileLength = 0
    let fileSize = 0

    rtc.on('ready', (data: {fileName: string, size: number}) => {
      clearInterval(interval)
      fileName = data.fileName
      fileSize = data.size
      this.setState({fileSize})
      rtc.emit('more-data', {block: 0})
    })

    rtc.on('data', (data) => {
      fileBuffer.push(data.data)
      fileLength += data.size
      this.setState({fileSent: fileLength})
      rtc.emit('more-data', {block: data.block + 1})
    })

    rtc.on('end', () => {
      log('Writing output')

      const fileData = new Uint8Array(fileLength)
      let i = 0

      fileBuffer.forEach((buf) => {
        const buffer = decode(buf)
        for(let j = 0; j < buffer.length; j++){
          fileData[i] = buffer.charCodeAt(j)
          i++
        }
      })

      let blob = new Blob([fileData], {type: 'ocet/stream'})
      const url = window.URL.createObjectURL(blob)
      
      let a = document.createElement("a")
      document.body.appendChild(a)
      //a.style = "display: none"

      a.href = url
      a.download = fileName
      a.click()
      window.URL.revokeObjectURL(url)

      this.setState({complete: true})
    })
  }

  render(){
    return <Container>
      <h1>File From Me</h1>
      {this.props.router.query.file ? this.receiver() : this.sender()}
    </Container>
  }

  sender(){
    if(!this.state.connectedToService){
      return <Await message="Connecting to service" />
    }

    if(this.state.file === null){
      return <FileSelect onSelectFile={(file: FileList) => this.setState({file})} />
    }

    if(!this.state.connectedToPeer){
      return <Await message={`Preparing to send ${this.state.file}. Give peer address ${location.href}file/${this.state.uuid}`} />
    }

    if(!this.state.complete){
      return <div>
        <progress max={this.state.fileSize} value={this.state.fileSent} />
        Sending ({filesize(this.state.fileSent)} / {filesize(this.state.fileSize)})
      </div>
    }

    return <div>Done!</div>
  }

  receiver(){
    if(!this.state.connectedToService){
      return <Await message="Connecting to service" />
    }

    if(!this.state.connectedToPeer){
      return <Await message="Connecting to peer" />
    }

    if(!this.state.complete){
      return <div>
        <progress max={this.state.fileSize} value={this.state.fileSent} />
        Receiving file ({filesize(this.state.fileSent)} / {filesize(this.state.fileSize)})`
      </div>
    }

    return <div>Done!</div>
  }
}

export default withRouter<IndexPageProps["router"]>(IndexPage as any)

const FileSelect: React.FunctionComponent<{
  onSelectFile: (file: FileList) => void
}> = ({onSelectFile}) => {
  const forTSToWork = (null as any as FileList)
  const [file, setFile] = useState(forTSToWork)

  return <form onSubmit={() => onSelectFile(file)}>
    <input type="file" onChange={(e) => setFile(e.target.files!)}/>
    <input type="submit" />
  </form>
}

const Await: React.FunctionComponent<{message: string}> = ({message}) => {
  return <div>
    {message}
  </div>
}
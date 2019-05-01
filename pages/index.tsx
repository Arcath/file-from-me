import React, {useState} from 'react'
import io from 'socket.io-client'
import {withRouter} from 'next/router'
import filesize from 'filesize'
import {encode, decode} from 'base-64'
import Link from 'next/link'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faCircleNotch} from '@fortawesome/fontawesome-free-solid'
import styled from '@emotion/styled'

import {log} from '../utils/log'
import {PeerConnection} from '../utils/peer-connection'

import {Container} from '../utils/styles'

import config from '../config.json'

interface IndexPageProps{
  router: {
    query: {
      file: string | undefined
    }
  }
}

const Spinner = styled(FontAwesomeIcon)`
  font-size:60px;
  margin:30px;
`

/** 
 * Maximum chunk size for the file transfers.
 * 
 * Any bigger that 102400 and JSON parsing will fail.
*/
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
  fileName: string
  running: boolean
}>{
  rtc: PeerConnection

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
      fileSent: 0,
      fileName: '',
      running: false
    }

    /** Little hack to stop TS complaining that it hasn't been created in the constructor. */
    this.rtc = false as any
  }

  componentDidMount(){
    const socket = io()

    /* Connect to another browser. */
    const connect = (host: boolean) => {
      const dataChannel = host ? `${this.state.uuid}-${this.state.peer}` : `${this.state.peer}-${this.state.uuid}`
      this.rtc = new PeerConnection(host, socket, this.state.uuid, this.state.peer, dataChannel)

      this.rtc.on('welcome', () => {
        log('Connected to peer')
        this.setState({connectedToPeer: true})
        
        if(host){
          this.sendFile()
        }else{
          this.recvFile()
        }
      })
    }

    /* Once connected to the socket.io server we will be given a uuid. */
    socket.on('connected', (data: {uuid: string}) => {
      log(`Connected as client ${data.uuid}`)
      /* Save the uuid into state and inform the UI that we are connected. */
      this.setState({uuid: data.uuid, connectedToService: true})

      /* If this is the recieiving browser pass the uuid over to the sending browser */
      if(this.props.router.query.file){
        socket.emit('webrtc-connect', {file: this.props.router.query.file})
      }
    })

    /* The sending browser needs to know the receivers uuid. Now we have it the RTC connection can be hosted. */
    socket.on('peer-uuid', (data: {uuid: string}) => {
      log(`Peer ${data.uuid} connected`)
      this.setState({peer: data.uuid})
      connect(true)
    })

    /* The host rtc connection should have been created now, join it. */
    socket.on('join-rtc', () => {
      connect(false)
    })

    socket.on('bad-peer-uuid', () => {
      console.error('Peer is not valid')
    })
  }

  /** Sends the file over the RTC connection. */
  sendFile(){
    const fileInTransit = this.state.file[0]
    const fileReader = new FileReader()

    /* When the receiver requests mote data. */
    this.rtc.on('more-data', (data: {block: number}) => {
      log(`Sending block ${data.block}`)
      /* The start bit is the `BLOCK_SIZE` multiplies by the number of blocks already sent. */
      const start = data.block * BLOCK_SIZE
      /* Create a slice of either the `BLOCK_SIZE` or the remaining file data */
      const slice = fileInTransit.slice(start, (start + Math.min(BLOCK_SIZE, fileInTransit.size - (data.block * BLOCK_SIZE))))
      
      /* If there is no data to send end the connection. */
      if(slice.size <= 0){
        this.rtc.emit('end')
        this.setState({complete: true})
        return // Early return to end the function.
      }
      
      fileReader.readAsBinaryString(slice)

      /* Once the browser has that chunk of the file send it. */
      fileReader.onload = (event) => {
        this.setState({fileSent: data.block * BLOCK_SIZE})

        /* The data is encoded using base64 to avoid odd characters breaking JSON */
        const d = encode((event.target as any).result)

        this.rtc.emit('data', {data: d, block: data.block, size: slice.size})
      }
    })

    /** Once the receiver is ready send it the fileName and size. */
    this.rtc.on('ready', () => {
      log(`Key: ${this.state.peer}`)
      this.setState({fileSize: fileInTransit.size})
      this.rtc.emit('ready', {fileName: fileInTransit.name, size: fileInTransit.size})
    })
  }

  /** Receive a file from the sending browser. */
  recvFile(){
    log('Requesting File')

    /* Keep pinging the sender to inform that we are ready to receive the file. */
    const interval = setInterval(() => this.rtc.emit('ready'), 200)
    const fileBuffer: any[] = []
    let fileName = 'unknown'
    let fileLength = 0
    let fileSize = 0

    /* Once the sending browser sends ready we can clear the interval and put everything into state. */
    this.rtc.on('ready', (data: {fileName: string, size: number}) => {
      log(`Key: ${this.state.uuid}`)
      clearInterval(interval)
      fileName = data.fileName
      fileSize = data.size
      this.setState({fileSize, fileName})
    })

    /* When data is received push it to the buffer and request more. */
    this.rtc.on('data', (data) => {
      fileBuffer.push(data.data)
      fileLength += data.size
      this.setState({fileSent: fileLength})
      this.rtc.emit('more-data', {block: data.block + 1})
    })

    /* When the file is complete */
    this.rtc.on('end', () => {
      log('Writing output')

      const fileData = new Uint8Array(fileLength)
      let i = 0

      /* Place the buffer into one long Uint8Array */
      fileBuffer.forEach((buf) => {
        const buffer = decode(buf)
        for(let j = 0; j < buffer.length; j++){
          fileData[i] = buffer.charCodeAt(j)
          i++
        }
      })

      /* Create a blob and a URL to the blob object. */
      let blob = new Blob([fileData], {type: 'ocet/stream'})
      const url = window.URL.createObjectURL(blob)
      
      /* Trigger the download of the blob now. */
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
      <h1>{config.title}</h1>
      {this.props.router.query.file ? this.receiver() : this.sender()}
      <Link href="/about">
        <a>About</a>
      </Link>
    </Container>
  }

  sender(){
    if(!this.state.connectedToService){
      return <Await message="Connecting to service" />
    }

    if(this.state.file === null){
      return <FileSelect onSelectFile={(file: FileList) => this.setState({file})} />
    }

    if(!this.state.connectedToPeer && !this.state.peer){
      return <Await message={`Preparing to send ${this.state.file[0].name}. Give peer address ${location.href}file/${this.state.uuid}`} />
    }

    if(!this.state.connectedToPeer){
      return <Await message="Connecting to peer" />
    }

    if(!this.state.complete){
      return <div>
        <progress max={this.state.fileSize} value={this.state.fileSent} />
        Sending ({filesize(this.state.fileSent)} / {filesize(this.state.fileSize)})
      </div>
    }

    return <div>Done! <a href="/">Send another File?</a></div>
  }

  receiver(){
    if(!this.state.connectedToService){
      return <Await message="Connecting to service" />
    }

    if(!this.state.connectedToPeer){
      return <Await message="Connecting to peer" />
    }

    if(!this.state.running){
      return <div>
        <p>Receive file {this.state.fileName}?</p>
        <button onClick={() => {
          this.rtc.emit('more-data', {block: 0})
          this.setState({running: true})
        }}>Download</button>
      </div>
    }

    if(!this.state.complete){
      return <div>
        <progress max={this.state.fileSize} value={this.state.fileSent} />
        Receiving file ({filesize(this.state.fileSent)} / {filesize(this.state.fileSize)})`
      </div>
    }

    return <div>Done! <a href="/">Send another File?</a></div>
  }
}

export default withRouter<IndexPageProps["router"]>(IndexPage as any)

const FileSelect: React.FunctionComponent<{
  onSelectFile: (file: FileList) => void
}> = ({onSelectFile}) => {
  const forTSToWork = (null as any as FileList)
  const [file, setFile] = useState(forTSToWork)

  return <form onSubmit={() => onSelectFile(file)}>
    <p>Secure file transfer directly from one browser to another.</p>
    <input type="file" onChange={(e) => setFile(e.target.files!)}/>
    <input type="submit" />
  </form>
}

const Await: React.FunctionComponent<{message: string}> = ({message}) => {
  return <div>
    {message}
    <Spinner icon={faCircleNotch} spin />
  </div>
}
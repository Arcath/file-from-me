import React, {useState} from 'react'
import Link from 'next/link'

import {Container} from '../utils/styles'

const AboutPage: React.FunctionComponent = () => {
  return <Container>
    <h1>About</h1>
    <Question title="How does it work?">
      <p>File From me uses WebRTC Data Channels to send data from one browser to another.</p>
    </Question>
    <Question title="How Anonymous is it?">
      <p>File From me requires no registration or any user details.</p>
      <p>The service merely brokers a connection between the two browsers. Once the required data has been passed between them it is no longer used.</p>
    </Question>
    <Question title="Who made this?">
      <a href="https://arcath.net">Adam Laycock</a>. You can read more about how this was made here or browse the source code on GitHub
    </Question>
    <Link href="/"><a>Back</a></Link>
  </Container>
}

const Question: React.FunctionComponent<{title: string}> = ({title, children}) => {
  const [open, setOpen] = useState(false)

  return <div>
    <h2 onClick={() => setOpen(!open)}>{title}</h2>
    {open ? children : ''}
  </div>
}

export default AboutPage
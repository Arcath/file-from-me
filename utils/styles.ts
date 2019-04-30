import {injectGlobal} from 'emotion'
import styled from '@emotion/styled'

const Colors = {
  background: "#99bbff"
}

injectGlobal`
  body{
    background-color:${Colors.background};
  }
`

export const Container = styled('div')`
  background-color:#fff;
  width:500px;
  margin:auto;
  margin-top:20vh;
  padding:10px;
  text-align:center;
`
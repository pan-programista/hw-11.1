import express from 'express'
import axios from 'axios'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import sockjs from 'sockjs'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import cookieParser from 'cookie-parser'
import Root from '../client/config/root'

import Html from '../client/html'

const { readFile, writeFile, unlink } = require('fs').promises

let connections = []

const port = process.env.PORT || 8090
const server = express()

const setHeaders = (req, res, next) => {
  res.set('x-skillcrucial-user', '9d8de08d-4893-46a5-8dfa-2008f7749500')
  res.set('Access-Control-Expose-Headers', 'X-SKILLCRUCIAL-USER')
  next()
}

const middleware = [
  cors(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))
server.use(setHeaders)

const saveFl = async (users) => {
  return writeFile(`${__dirname}/users.json`, JSON.stringify(users), { encoding: 'utf8' })
}
const readFl = async () => {
  return readFile(`${__dirname}/users.json`, { encoding: 'utf8' })
    .then((data) => JSON.parse(data))
    .catch(async () => {
      const { data: users } = await axios('https://jsonplaceholder.typicode.com/users')
      await saveFl(users)
      return users
    })
}

server.get('/api/v1/users', async (req, res) => {
  const users = await readFl()
  res.json(users)
})

server.post('/api/v1/users', async (req, res) => {
  let newUser = req.body
  let users = await readFl()
  const newUserId = users[users.length - 1].id + 1
  newUser = { ...newUser, id: newUserId }
  users = [...users, newUser]
  await saveFl(users)
  res.json({ status: 'success', id: newUserId })
})

server.delete('/api/v1/users', async (req, res) => {
  await unlink(`${__dirname}/users.json`)
  res.json({ status: 'ok' })
})

server.patch('/api/v1/users/:userId', async (req, res) => {
  const userPatch = req.body
  let users = await readFl()
  const { userId } = req.params
  users = users.map((it) => (it.id === +userId ? { ...it, ...userPatch } : it))
  await saveFl(users)
  res.json({ status: 'success', id: +userId })
})

server.delete('/api/v1/users/:userId', async (req, res) => {
  let users = await readFl()
  const { userId } = req.params
  users = users.filter((it) => it.id !== +userId)
  await saveFl(users)
  res.json({ status: 'success', id: +userId })
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const echo = sockjs.createServer()
echo.on('connection', (conn) => {
  connections.push(conn)
  conn.on('data', async () => {})

  conn.on('close', () => {
    connections = connections.filter((c) => c.readyState !== 3)
  })
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

const app = server.listen(port)

echo.installHandlers(app, { prefix: '/ws' })

// eslint-disable-next-line no-console
console.log(`Serving at http://localhost:${port}`)
